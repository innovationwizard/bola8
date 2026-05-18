ALTER TABLE images
  ADD COLUMN IF NOT EXISTS reference_image_id UUID
    REFERENCES project_reference_images(id) ON DELETE SET NULL;
