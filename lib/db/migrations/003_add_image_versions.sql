-- Migration: Add image version tracking and enhancement metadata
-- Created: 2025-01-XX

-- Add parent_image_id to link original to enhanced versions
ALTER TABLE images 
ADD COLUMN IF NOT EXISTS parent_image_id UUID REFERENCES images(id) ON DELETE SET NULL;

-- Add enhancement metadata columns
ALTER TABLE images 
ADD COLUMN IF NOT EXISTS enhancement_type VARCHAR(50) CHECK (enhancement_type IN ('general', 'targeted', 'color', 'lighting', 'elements', 'training', NULL)),
ADD COLUMN IF NOT EXISTS enhancement_metadata JSONB;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_images_parent ON images(parent_image_id);
CREATE INDEX IF NOT EXISTS idx_images_enhancement_type ON images(enhancement_type);
CREATE INDEX IF NOT EXISTS idx_images_project_workflow ON images(project_id, workflow_step);

-- Add version number for tracking multiple enhancements
ALTER TABLE images
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Create index for version queries
CREATE INDEX IF NOT EXISTS idx_images_version ON images(parent_image_id, version);

