-- Migration 011: feedback fields on images
-- Enables the creative feedback loop: rate → describe → regenerate until satisfied

ALTER TABLE images
  ADD COLUMN IF NOT EXISTS rating              INTEGER CHECK (rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS liked_aspects       TEXT,
  ADD COLUMN IF NOT EXISTS improvement_notes   TEXT;
