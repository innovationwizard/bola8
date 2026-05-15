-- Migration 012: clients table + brand DNA at client and project level
-- Introduces a proper clients entity so brand rules can be shared
-- across all campaigns belonging to the same client.
-- Idempotent: all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.

-- ── clients ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  brand_dna   JSONB,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_name ON clients(name);

-- ── projects: add client_id FK + project-level brand guidelines ───────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_id         UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand_guidelines  JSONB;

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);

-- ── data migration: create client records from existing unique client_name ─────
INSERT INTO clients (name)
SELECT DISTINCT client_name
  FROM projects
 WHERE client_name IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── data migration: link existing projects to their new client record ──────────
UPDATE projects p
   SET client_id = c.id
  FROM clients c
 WHERE p.client_name = c.name
   AND p.client_id IS NULL;
