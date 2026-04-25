-- Migration 007: Add enhancement ratings, prompt versions, and parameter experiments
-- Created: 2025-01-XX
-- Description: Add tables for tracking enhancement quality, prompt versions, and parameter experiments

-- ============================================================================
-- ENHANCEMENT RATINGS
-- ============================================================================
-- Store user ratings for different enhancement options (A, B, etc.)

CREATE TABLE IF NOT EXISTS enhancement_ratings (
  id SERIAL PRIMARY KEY,
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  option VARCHAR(10) NOT NULL, -- 'A', 'B', 'C', etc.
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comments TEXT,
  rated_by VARCHAR(255), -- User identifier (email, username, etc.)
  rated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for quick lookups by image and option
CREATE INDEX IF NOT EXISTS idx_enhancement_ratings_image_id ON enhancement_ratings(image_id);
CREATE INDEX IF NOT EXISTS idx_enhancement_ratings_option ON enhancement_ratings(option);
CREATE INDEX IF NOT EXISTS idx_enhancement_ratings_rated_at ON enhancement_ratings(rated_at);

-- ============================================================================
-- PROMPT VERSIONS
-- ============================================================================
-- Store different prompt versions and track their performance

CREATE TABLE IF NOT EXISTS prompt_versions (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) UNIQUE NOT NULL,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  performance_score FLOAT, -- Average rating from enhancement_ratings
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  description TEXT -- Optional description of the prompt version
);

-- Index for active prompt versions
CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON prompt_versions(is_active);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_performance ON prompt_versions(performance_score DESC);

-- ============================================================================
-- PARAMETER EXPERIMENTS
-- ============================================================================
-- Store parameter experiments and their ratings for optimization

CREATE TABLE IF NOT EXISTS parameter_experiments (
  id SERIAL PRIMARY KEY,
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  prompt_version_id INTEGER REFERENCES prompt_versions(id) ON DELETE SET NULL,
  init_strength FLOAT,
  guidance_scale FLOAT,
  controlnet_weight FLOAT,
  strength FLOAT, -- For Stable Diffusion
  num_inference_steps INTEGER, -- For Stable Diffusion
  rating FLOAT, -- Rating from 1-5 (can be NULL if not rated yet)
  created_at TIMESTAMP DEFAULT NOW(),
  provider VARCHAR(50), -- 'leonardo', 'stablediffusion', etc.
  metadata JSONB -- Additional parameters stored as JSON
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_parameter_experiments_image_id ON parameter_experiments(image_id);
CREATE INDEX IF NOT EXISTS idx_parameter_experiments_prompt_version_id ON parameter_experiments(prompt_version_id);
CREATE INDEX IF NOT EXISTS idx_parameter_experiments_rating ON parameter_experiments(rating DESC);
CREATE INDEX IF NOT EXISTS idx_parameter_experiments_provider ON parameter_experiments(provider);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE enhancement_ratings IS 'Stores user ratings for different enhancement options (A, B, etc.)';
COMMENT ON TABLE prompt_versions IS 'Stores different prompt versions and tracks their performance metrics';
COMMENT ON TABLE parameter_experiments IS 'Stores parameter experiments for optimization and A/B testing';

COMMENT ON COLUMN enhancement_ratings.option IS 'Enhancement option identifier: A, B, C, etc.';
COMMENT ON COLUMN enhancement_ratings.rating IS 'User rating from 1 (worst) to 5 (best)';
COMMENT ON COLUMN prompt_versions.performance_score IS 'Average rating from enhancement_ratings for this prompt version';
COMMENT ON COLUMN prompt_versions.usage_count IS 'Number of times this prompt version has been used';
COMMENT ON COLUMN parameter_experiments.rating IS 'Rating from 1-5 for this parameter combination (NULL if not rated)';
COMMENT ON COLUMN parameter_experiments.metadata IS 'Additional parameters stored as JSON for flexibility';

