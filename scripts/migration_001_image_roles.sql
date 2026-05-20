-- Migration 001: Image roles, pin support, per-post reference images
-- Run: node scripts/run-migration.js scripts/migration_001_image_roles.sql
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS

-- 1. Add role column to project_reference_images
--    'style' = mood board / atmosphere / palette reference (existing behavior)
--    'render' = actual render or photo of the real property (new: structural anchor)
ALTER TABLE project_reference_images
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'style'
    CHECK (role IN ('render', 'style'));

-- 2. Add is_pinned column — only one render per project can be pinned (the generation base)
ALTER TABLE project_reference_images
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Partial unique index: at most one pinned render per project
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pinned_render_per_project
  ON project_reference_images (project_id)
  WHERE is_pinned = TRUE AND role = 'render';

-- 4. Create post_reference_images table (Pinterest Inspo — per post, max 3)
CREATE TABLE IF NOT EXISTS post_reference_images (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storage_path  TEXT        NOT NULL,
  url           TEXT,
  caption       TEXT,
  display_order INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_reference_images_post_id
  ON post_reference_images (post_id);
