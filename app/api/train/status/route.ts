import { NextResponse } from 'next/server';
import { getTrainingStats, getSamplesSinceLastEvolution } from '@/lib/db/training';
import { loadCurrentPromptVersion } from '@/lib/prompt-loader';
import { checkMLServiceHealth } from '@/lib/ml-client';

export async function GET() {
  try {
    const stats = await getTrainingStats();
    const currentPrompt = await loadCurrentPromptVersion();
    const mlServiceHealthy = await checkMLServiceHealth();
    const samplesSinceEvolution = await getSamplesSinceLastEvolution();

    const phase1Active = stats.total_samples < 50 && stats.best_rating < 4.0;
    const convergence = Math.min(stats.total_samples / 50, 1.0);

    const nextEvolutionSample = Math.ceil((stats.total_samples + samplesSinceEvolution) / 10) * 10;

    return NextResponse.json({
      phase_1: {
        active: phase1Active,
        samples_collected: stats.total_samples,
        best_rating: stats.best_rating,
        convergence,
        estimated_trials_remaining: Math.max(50 - stats.total_samples, 0),
      },
      phase_2: {
        active: true, // Phase 2 starts immediately
        training_samples: stats.total_samples,
        model_accuracy: null, // Will be updated when Phase 2 model is trained
        ready_for_inference: false,
      },
      prompt_evolution: {
        current_version: currentPrompt.version,
        last_evolution: currentPrompt.created_at,
        next_evolution_at_sample: nextEvolutionSample,
        samples_since_last: samplesSinceEvolution,
      },
      current_best: {
        avg_rating: stats.avg_rating,
        best_rating: stats.best_rating,
        samples_by_api: stats.samples_by_api,
      },
      ml_service: {
        healthy: mlServiceHealthy,
        url: process.env.ML_SERVICE_URL || null,
      },
    });
  } catch (error: unknown) {
    console.error('Error getting training status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get status' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
