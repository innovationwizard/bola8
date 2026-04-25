-- Bola8 Interiors Database Schema
-- Designed for PostgreSQL (AWS RDS)

-- Users table - authentication and access control
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'designer' CHECK (role IN ('admin', 'designer', 'viewer')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(active);

-- Projects table - core entity tracking the entire workflow
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(255),
  client_phone VARCHAR(50),
  project_name VARCHAR(255) NOT NULL,
  project_type VARCHAR(50) NOT NULL CHECK (project_type IN ('space_design', 'furniture_design')),
  status VARCHAR(50) NOT NULL DEFAULT 'lead' CHECK (status IN (
    'lead',
    'scheduled',
    'site_visit',
    'design',
    'client_review_1',
    'design_revision_1',
    'client_review_2',
    'design_revision_2',
    'client_review_3',
    'quotation',
    'technical_drawings',
    'manufacturing',
    'installation',
    'completed'
  )),
  budget_range VARCHAR(100),
  room_type VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Site visits - measurements, photos, notes from on-site visits
CREATE TABLE site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  visit_date TIMESTAMP WITH TIME ZONE,
  measurements JSONB, -- Store measurements as JSON: {width: 300, height: 250, depth: 60, unit: 'cm'}
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Images - both original uploads and enhanced versions
CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  site_visit_id UUID REFERENCES site_visits(id) ON DELETE SET NULL,
  workflow_step VARCHAR(50), -- Which workflow step this image belongs to
  image_type VARCHAR(50) NOT NULL CHECK (image_type IN ('original', 'enhanced', 'render', 'technical', 'other', 'photo', 'file')),
  original_url TEXT, -- S3 URL for original upload
  enhanced_url TEXT, -- S3 URL for Leonardo enhanced version
  leonardo_image_id VARCHAR(255), -- Leonardo AI image ID
  s3_key TEXT, -- S3 key for storage
  s3_bucket VARCHAR(255), -- S3 bucket name
  filename VARCHAR(255),
  mime_type VARCHAR(100),
  width INTEGER,
  height INTEGER,
  metadata JSONB, -- Additional metadata (dimensions, mode, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Quotes - linked to projects, can have multiple versions
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  quote_type VARCHAR(50) NOT NULL CHECK (quote_type IN ('furniture', 'space')),
  quote_data JSONB NOT NULL, -- Store the full quote calculation data
  total_amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'MXN',
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected')),
  version INTEGER DEFAULT 1, -- Track quote revisions
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Design files - links to Rhino, SketchUp, Canva presentations, etc.
CREATE TABLE design_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_step VARCHAR(50), -- Which workflow step this file belongs to
  file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('drawing', 'render', 'presentation', 'technical', 'other', 'document', 'photo')),
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT, -- Could be S3, Google Drive link, etc.
  storage_type VARCHAR(50) CHECK (storage_type IN ('s3', 'google_drive', 'local', 'external')),
  s3_key TEXT, -- S3 key if stored in S3
  s3_bucket VARCHAR(255), -- S3 bucket name
  mime_type VARCHAR(100),
  file_size BIGINT, -- File size in bytes
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Project notes - notes added at each workflow step
CREATE TABLE project_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_step VARCHAR(50) NOT NULL, -- Which workflow step this note belongs to
  note_text TEXT NOT NULL,
  created_by VARCHAR(255), -- User/client name who added the note
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Client reviews - track revision rounds and feedback
CREATE TABLE client_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  review_round INTEGER NOT NULL DEFAULT 1,
  feedback TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revision_requested')),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_client_name ON projects(client_name);
CREATE INDEX idx_projects_created_at ON projects(created_at);
CREATE INDEX idx_site_visits_project_id ON site_visits(project_id);
CREATE INDEX idx_images_project_id ON images(project_id);
CREATE INDEX idx_images_image_type ON images(image_type);
CREATE INDEX idx_images_workflow_step ON images(workflow_step);
CREATE INDEX idx_quotes_project_id ON quotes(project_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_design_files_project_id ON design_files(project_id);
CREATE INDEX idx_design_files_workflow_step ON design_files(workflow_step);
CREATE INDEX idx_client_reviews_project_id ON client_reviews(project_id);
CREATE INDEX idx_project_notes_project_id ON project_notes(project_id);
CREATE INDEX idx_project_notes_workflow_step ON project_notes(workflow_step);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

