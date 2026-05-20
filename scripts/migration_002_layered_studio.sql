-- Migration 002: Layered Asset Studio + API usage logging
-- Run: node scripts/migrate.js scripts/migration_002_layered_studio.sql
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS

-- 1. asset_packs — groups all layers for a single post generation event.
--    A post can have multiple packs (history); posts.active_asset_pack_id points to the current one.
CREATE TABLE IF NOT EXISTS asset_packs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID        NOT NULL REFERENCES posts(id)    ON DELETE CASCADE,
  project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'generating', 'ready', 'failed', 'partial')),
  generation_path TEXT        NOT NULL DEFAULT 'hybrid'
                    CHECK (generation_path IN ('decompose', 'per-layer', 'hybrid')),
  style_card      JSONB,
  parent_pack_id  UUID        REFERENCES asset_packs(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_packs_post_id    ON asset_packs (post_id);
CREATE INDEX IF NOT EXISTS idx_asset_packs_project_id ON asset_packs (project_id);

-- 2. Extend images with layer membership.
--    layer_type is nullable — pre-existing single-image rows keep NULL.
ALTER TABLE images
  ADD COLUMN IF NOT EXISTS asset_pack_id UUID
    REFERENCES asset_packs(id) ON DELETE CASCADE;

ALTER TABLE images
  ADD COLUMN IF NOT EXISTS layer_type TEXT
    CHECK (layer_type IN (
      'background',
      'building',
      'environment',
      'featured',
      'ornaments',
      'people',
      'composite'
    ));

CREATE INDEX IF NOT EXISTS idx_images_asset_pack
  ON images (asset_pack_id);

CREATE INDEX IF NOT EXISTS idx_images_pack_layer
  ON images (asset_pack_id, layer_type);

-- 3. Posts get a pointer to their active pack (most recent ready pack by default).
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS active_asset_pack_id UUID
    REFERENCES asset_packs(id) ON DELETE SET NULL;

-- 4. api_usage_logs — every paid API call (Gemini, Imagen, Bria, Qwen) appends a row.
--    Operator-only via /admin/usage. No end-user surface.
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  route          TEXT,                                                     -- e.g. '/api/posts/[id]/asset-pack'
  provider       TEXT         NOT NULL,                                    -- 'google' | 'fal'
  model          TEXT         NOT NULL,                                    -- model id used
  operation      TEXT         NOT NULL,                                    -- 'generate' | 'compose' | 'decompose' | 'rmbg' | 'extract' | etc.
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  image_count    INTEGER      NOT NULL DEFAULT 1,
  cost_usd       NUMERIC(10,6),                                            -- per-call cost in USD
  latency_ms     INTEGER      NOT NULL,
  user_email     TEXT,                                                     -- signed-in user (if available)
  post_id        UUID         REFERENCES posts(id)        ON DELETE SET NULL,
  project_id     UUID         REFERENCES projects(id)     ON DELETE SET NULL,
  asset_pack_id  UUID         REFERENCES asset_packs(id)  ON DELETE SET NULL,
  layer_type     TEXT,
  success        BOOLEAN      NOT NULL,
  error_message  TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_project    ON api_usage_logs (project_id,    created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_post       ON api_usage_logs (post_id,       created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_pack       ON api_usage_logs (asset_pack_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_provider   ON api_usage_logs (provider, model, created_at DESC);
