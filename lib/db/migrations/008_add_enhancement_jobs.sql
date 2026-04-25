-- Enhancement jobs table for async processing (Vercel free tier 10s timeout)
CREATE TABLE IF NOT EXISTS enhancement_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | complete | failed
  project_id UUID,
  site_visit_id UUID,
  filename TEXT,
  mime_type TEXT,
  mode TEXT NOT NULL DEFAULT 'surfaces',
  original_storage_path TEXT,
  original_url TEXT,
  leonardo_generation_id TEXT,
  replicate_prediction_id TEXT,
  result_options JSONB DEFAULT '[]',
  errors JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enhancement_jobs_status ON enhancement_jobs (status);
