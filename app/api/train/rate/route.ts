import { NextResponse } from 'next/server';
import { saveRating, getTrainingStats, getSamplesSinceLastEvolution } from '@/lib/db/training';
import { updateModel } from '@/lib/ml-client';
import { query } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ratings, rated_by } = body;

    if (!ratings || !Array.isArray(ratings)) {
      return NextResponse.json(
        { error: 'Invalid ratings format' },
        { status: 400 }
      );
    }

    // Validate ratings
    for (const rating of ratings) {
      if (!rating.image_id || !rating.rating || rating.rating < 1 || rating.rating > 5) {
        return NextResponse.json(
          { error: 'Each rating must have image_id and rating (1-5)' },
          { status: 400 }
        );
      }
    }

    // Save all ratings to database
    const savedRatings = [];
    for (const rating of ratings) {
      const ratingId = await saveRating({
        image_id: rating.image_id,
        option: rating.option,
        rating: rating.rating,
        comments: rating.comments || '',
        rated_by: rated_by || 'trainer',
      });
      savedRatings.push({ ...rating, id: ratingId });
    }

    // Update parameter_experiments table with ratings
    for (const rating of ratings) {
      await query(
        `UPDATE parameter_experiments
         SET rating = $1
         WHERE image_id = $2`,
        [rating.rating, rating.image_id]
      );
    }

    // Get image metadata to extract parameters for ML update
    const parametersForML = [];
    for (const rating of ratings) {
      const imageResult = await query(
        `SELECT
           i.metadata,
           pe.init_strength,
           pe.guidance_scale,
           pe.controlnet_weight
         FROM images i
         LEFT JOIN parameter_experiments pe ON pe.image_id = i.id
         WHERE i.id = $1`,
        [rating.image_id]
      );

      if (imageResult.rows.length > 0) {
        const row = imageResult.rows[0];
        const metadata = row.metadata;
        const api = metadata.provider;

        if (api === 'leonardo') {
          parametersForML.push({
            parameters: {
              api: 'leonardo' as const,
              init_strength: row.init_strength,
              guidance_scale: row.guidance_scale,
              controlnet_weight: row.controlnet_weight,
            },
            rating: rating.rating,
          });
        } else if (api === 'stablediffusion') {
          parametersForML.push({
            parameters: {
              api: 'stablediffusion' as const,
              strength: row.init_strength,
              guidance_scale: row.guidance_scale,
              controlnet_conditioning_scale: row.controlnet_weight,
            },
            rating: rating.rating,
          });
        }
      }
    }

    // Update ML model with new ratings
    let mlUpdateResult = { updated: false, samples_seen: 0, convergence_score: 0 };
    if (parametersForML.length > 0) {
      try {
        mlUpdateResult = await updateModel({
          results: parametersForML,
        });
        console.log('ML model updated:', mlUpdateResult);
      } catch (error) {
        console.error('Error updating ML model:', error);
      }
    }

    // Get updated training stats
    const stats = await getTrainingStats();

    // Check if Phase 1 is complete (50 samples or best rating >= 4.0)
    const phase1Complete = stats.total_samples >= 50 || stats.best_rating >= 4.0;

    // Check if we need to trigger prompt evolution (every 10 samples)
    const samplesSinceEvolution = await getSamplesSinceLastEvolution();
    const shouldEvolve = samplesSinceEvolution >= 10 && stats.best_rating < 4.5;

    if (shouldEvolve) {
      console.log('Triggering prompt evolution (background)...');
      // Trigger evolution asynchronously (don't wait)
      triggerPromptEvolution().catch(console.error);
    }

    return NextResponse.json({
      success: true,
      message: 'Calificaciones guardadas exitosamente',
      ml_updated: mlUpdateResult.updated,
      current_best_rating: stats.best_rating,
      samples_collected: stats.total_samples,
      phase_1_complete: phase1Complete,
      evolution_triggered: shouldEvolve,
    });
  } catch (error: unknown) {
    console.error('Error saving ratings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save ratings' },
      { status: 500 }
    );
  }
}

async function triggerPromptEvolution() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/train/evolve`, {
      method: 'POST',
    });

    if (response.ok) {
      console.log('Prompt evolution triggered successfully');
    } else {
      console.error('Failed to trigger prompt evolution:', response.status);
    }
  } catch (error) {
    console.error('Error triggering prompt evolution:', error);
  }
}

export const runtime = 'nodejs';
