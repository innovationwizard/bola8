-- Migration: Create all base tables (must run before 001+)
-- These tables existed on the original RDS but were never codified in a migration.

-- ── projects ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name   VARCHAR(255) NOT NULL,
  client_email  VARCHAR(255),
  client_phone  VARCHAR(100),
  project_name  VARCHAR(255) NOT NULL,
  project_type  VARCHAR(50)  NOT NULL CHECK (project_type IN ('space_design', 'furniture_design')),
  status        VARCHAR(50)  NOT NULL DEFAULT 'lead',
  budget_range  VARCHAR(100),
  room_type     VARCHAR(100),
  notes         TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_type     ON projects(project_type);
CREATE INDEX IF NOT EXISTS idx_projects_updated  ON projects(updated_at DESC);

-- ── site_visits ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_visits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  visit_date  DATE,
  notes       TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_site_visits_project ON site_visits(project_id);

-- ── images ────────────────────────────────────────────────────────────────────
-- 003_add_image_versions.sql adds: parent_image_id, enhancement_type,
--   enhancement_metadata, version
CREATE TABLE IF NOT EXISTS images (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,
  site_visit_id     UUID REFERENCES site_visits(id) ON DELETE SET NULL,
  workflow_step     VARCHAR(50),
  image_type        VARCHAR(50) NOT NULL DEFAULT 'other',
  original_url      TEXT,
  enhanced_url      TEXT,
  leonardo_image_id VARCHAR(255),
  s3_key            TEXT,
  s3_bucket         VARCHAR(100),
  filename          VARCHAR(255),
  mime_type         VARCHAR(100),
  width             INTEGER,
  height            INTEGER,
  metadata          JSONB,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_images_project   ON images(project_id);
CREATE INDEX IF NOT EXISTS idx_images_type      ON images(image_type);
CREATE INDEX IF NOT EXISTS idx_images_visit     ON images(site_visit_id);

-- ── quotes ────────────────────────────────────────────────────────────────────
-- 005_add_spaces_and_quotation_engine.sql adds: iva_rate, margin_rate,
--   current_version_id
CREATE TABLE IF NOT EXISTS quotes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  quote_type    VARCHAR(50),
  quote_data    JSONB,
  total_amount  DECIMAL(12, 2) DEFAULT 0,
  currency      VARCHAR(10)  DEFAULT 'MXN',
  status        VARCHAR(50)  DEFAULT 'draft',
  version       INTEGER      DEFAULT 1,
  notes         TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quotes_project ON quotes(project_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status  ON quotes(status);

-- ── design_files ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS design_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_step VARCHAR(50),
  file_type     VARCHAR(50),
  file_name     VARCHAR(255),
  file_url      TEXT,
  storage_type  VARCHAR(50) DEFAULT 'supabase',
  s3_key        TEXT,
  s3_bucket     VARCHAR(100),
  mime_type     VARCHAR(100),
  file_size     BIGINT,
  description   TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_design_files_project ON design_files(project_id);

-- ── client_reviews ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  review_round  INTEGER DEFAULT 1,
  feedback      TEXT,
  status        VARCHAR(50) DEFAULT 'pending',
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_client_reviews_project ON client_reviews(project_id);

-- ── project_notes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_step VARCHAR(50),
  note_text     TEXT NOT NULL,
  created_by    UUID,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_notes_project ON project_notes(project_id);
