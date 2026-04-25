/**
 * Training Database Operations
 *
 * Database utilities for the ML training system
 */

import { query } from './index';

export interface Rating {
  id?: number;
  image_id: string; // UUID
  option: string;
  rating: number;
  comments?: string;
  rated_by: string;
  rated_at?: Date;
}

export interface ParameterExperiment {
  id?: number;
  image_id: string; // UUID
  prompt_version_id: number;
  init_strength?: number;
  guidance_scale?: number;
  controlnet_weight?: number;
  rating?: number;
  created_at?: Date;
}

export interface PromptVersionDB {
  id?: number;
  version: string;
  prompt: string;
  negative_prompt: string;
  created_at?: Date;
  performance_score?: number;
  usage_count?: number;
}

/**
 * Save a rating for an enhanced image
 */
export async function saveRating(rating: Rating): Promise<number> {
  const result = await query(
    `INSERT INTO enhancement_ratings (image_id, option, rating, comments, rated_by, rated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      rating.image_id,
      rating.option,
      rating.rating,
      rating.comments || null,
      rating.rated_by,
      rating.rated_at ? (rating.rated_at instanceof Date ? rating.rated_at.toISOString() : rating.rated_at) : new Date().toISOString(),
    ]
  );

  return result.rows[0].id;
}

/**
 * Save a parameter experiment
 */
export async function saveParameterExperiment(experiment: ParameterExperiment): Promise<number> {
  const result = await query(
    `INSERT INTO parameter_experiments
     (image_id, prompt_version_id, init_strength, guidance_scale, controlnet_weight, rating, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      experiment.image_id,
      experiment.prompt_version_id,
      experiment.init_strength ?? null,
      experiment.guidance_scale ?? null,
      experiment.controlnet_weight ?? null,
      experiment.rating ?? null,
      experiment.created_at ? (experiment.created_at instanceof Date ? experiment.created_at.toISOString() : experiment.created_at) : new Date().toISOString(),
    ]
  );

  return result.rows[0].id;
}

/**
 * Get or create prompt version in database
 */
export async function ensurePromptVersionInDB(
  version: string,
  prompt: string,
  negativePrompt: string
): Promise<number> {
  // Check if exists
  const existing = await query(
    'SELECT id FROM prompt_versions WHERE version = $1',
    [version]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  // Create new
  const result = await query(
    `INSERT INTO prompt_versions (version, prompt, negative_prompt, created_at, usage_count)
     VALUES ($1, $2, $3, $4, 0)
     RETURNING id`,
    [version, prompt, negativePrompt, new Date().toISOString()]
  );

  return result.rows[0].id;
}

/**
 * Get training history with ratings
 */
export async function getTrainingHistory(
  limit: number = 50,
  offset: number = 0,
  filters?: {
    minRating?: number;
    api?: string;
  }
): Promise<Record<string, unknown>[]> {
  let sql = `
    SELECT
      i.id as image_id,
      i.created_at,
      i.metadata->>'option' as option,
      i.metadata->>'provider' as api,
      r.rating,
      r.comments,
      r.rated_by,
      r.rated_at,
      pe.init_strength,
      pe.guidance_scale,
      pe.controlnet_weight,
      pv.version as prompt_version,
      i.s3_bucket,
      i.s3_key
    FROM images i
    LEFT JOIN enhancement_ratings r ON r.image_id = i.id
    LEFT JOIN parameter_experiments pe ON pe.image_id = i.id
    LEFT JOIN prompt_versions pv ON pv.id = pe.prompt_version_id
    WHERE i.image_type = 'enhanced'
    AND i.metadata->>'enhancement_type' = 'general'
  `;

  const params: (string | number | boolean | null)[] = [];
  let paramCount = 1;

  if (filters?.minRating) {
    sql += ` AND r.rating >= $${paramCount}`;
    params.push(filters.minRating);
    paramCount++;
  }

  if (filters?.api) {
    sql += ` AND i.metadata->>'provider' = $${paramCount}`;
    params.push(filters.api);
    paramCount++;
  }

  sql += ` ORDER BY i.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  params.push(limit, offset);

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get best parameters based on ratings
 */
export async function getBestParameters(api: string): Promise<Record<string, unknown> | null> {
  const result = await query(
    `SELECT
       AVG(pe.init_strength) as avg_init_strength,
       AVG(pe.guidance_scale) as avg_guidance_scale,
       AVG(pe.controlnet_weight) as avg_controlnet_weight,
       AVG(r.rating) as avg_rating,
       COUNT(*) as sample_count
     FROM parameter_experiments pe
     JOIN enhancement_ratings r ON r.image_id = pe.image_id
     JOIN images i ON i.id = pe.image_id
     WHERE i.metadata->>'provider' = $1
     AND r.rating >= 4.0
     ORDER BY r.rating DESC
     LIMIT 10`,
    [api]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Get training statistics
 */
export async function getTrainingStats(): Promise<{
  total_samples: number;
  avg_rating: number;
  best_rating: number;
  samples_by_api: Record<string, { count: number; avg_rating: number }>;
  rating_trend: number[];
}> {
  // Total samples and avg rating
  const totalsResult = await query(`
    SELECT
      COUNT(DISTINCT i.id) as total_samples,
      AVG(r.rating) as avg_rating,
      MAX(r.rating) as best_rating
    FROM images i
    JOIN enhancement_ratings r ON r.image_id = i.id
    WHERE i.image_type = 'enhanced'
  `);

  const totals = totalsResult.rows[0];

  // Samples by API
  const apiResult = await query(`
    SELECT
      i.metadata->>'provider' as api,
      COUNT(*) as count,
      AVG(r.rating) as avg_rating
    FROM images i
    JOIN enhancement_ratings r ON r.image_id = i.id
    WHERE i.image_type = 'enhanced'
    GROUP BY i.metadata->>'provider'
  `);

  const samplesByApi: Record<string, { count: number; avg_rating: number }> = {};
  apiResult.rows.forEach(row => {
    samplesByApi[row.api] = {
      count: parseInt(row.count),
      avg_rating: parseFloat(row.avg_rating),
    };
  });

  // Rating trend (last 10 samples)
  const trendResult = await query(`
    SELECT AVG(rating) as avg_rating
    FROM (
      SELECT r.rating, r.rated_at,
        NTILE(10) OVER (ORDER BY r.rated_at) as bucket
      FROM enhancement_ratings r
      JOIN images i ON i.id = r.image_id
      WHERE i.image_type = 'enhanced'
    ) bucketed
    GROUP BY bucket
    ORDER BY bucket
  `);

  const ratingTrend = trendResult.rows.map(row => parseFloat(row.avg_rating));

  return {
    total_samples: parseInt(totals.total_samples) || 0,
    avg_rating: parseFloat(totals.avg_rating) || 0,
    best_rating: parseFloat(totals.best_rating) || 0,
    samples_by_api: samplesByApi,
    rating_trend: ratingTrend,
  };
}

/**
 * Update prompt version performance in database
 */
export async function updatePromptVersionPerformance(
  version: string,
  performanceScore: number
): Promise<void> {
  await query(
    `UPDATE prompt_versions
     SET performance_score = $1, usage_count = usage_count + 1
     WHERE version = $2`,
    [performanceScore, version]
  );
}

/**
 * Get recent ratings for analysis (used by prompt evolution)
 */
export async function getRecentRatings(limit: number = 10): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT
       r.rating,
       r.comments,
       r.rated_at,
       i.metadata->>'provider' as api,
       i.metadata->>'option' as option,
       pv.version as prompt_version,
       pe.init_strength,
       pe.guidance_scale,
       pe.controlnet_weight
     FROM enhancement_ratings r
     JOIN images i ON i.id = r.image_id
     LEFT JOIN parameter_experiments pe ON pe.image_id = i.id
     LEFT JOIN prompt_versions pv ON pv.id = pe.prompt_version_id
     WHERE i.image_type = 'enhanced'
     ORDER BY r.rated_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

/**
 * Check if prompt evolution is needed
 */
export async function shouldTriggerEvolution(): Promise<boolean> {
  const result = await query(`
    SELECT COUNT(*) as count
    FROM enhancement_ratings
  `);

  const count = parseInt(result.rows[0].count);

  // Trigger every 10 samples
  return count > 0 && count % 10 === 0;
}

/**
 * Get samples count since last evolution
 */
export async function getSamplesSinceLastEvolution(): Promise<number> {
  // Get last evolution timestamp from prompt_versions
  const lastEvolution = await query(`
    SELECT MAX(created_at) as last_evolution
    FROM prompt_versions
    WHERE version != 'v1.0.0'
  `);

  const lastEvolutionDate = lastEvolution.rows[0]?.last_evolution;

  if (!lastEvolutionDate) {
    // No evolution yet, count all samples
    const result = await query(`
      SELECT COUNT(*) as count
      FROM enhancement_ratings
    `);
    return parseInt(result.rows[0].count);
  }

  // Count samples since last evolution
  const result = await query(
    `SELECT COUNT(*) as count
     FROM enhancement_ratings r
     WHERE r.rated_at > $1`,
    [lastEvolutionDate]
  );

  return parseInt(result.rows[0].count);
}
