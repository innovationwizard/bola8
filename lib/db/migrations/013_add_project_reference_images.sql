CREATE TABLE IF NOT EXISTS project_reference_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  url           TEXT NOT NULL,
  caption       TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_reference_images_project_id
  ON project_reference_images(project_id, display_order);
