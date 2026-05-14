-- Migration 010: add descripcion column to posts
-- Stores the internal creative brief per post (sourced from DOCX "Descripción" column)
-- No data loss: all DOCX content must be preserved

ALTER TABLE posts ADD COLUMN IF NOT EXISTS descripcion TEXT;
