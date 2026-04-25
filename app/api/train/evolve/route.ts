import { NextResponse } from 'next/server';
import { triggerPromptEvolution } from '@/lib/prompt-evolution';

/**
 * Manual trigger for prompt evolution
 * (Also triggered automatically every 10 samples)
 */
export async function POST() {
  try {
    console.log('Manual prompt evolution trigger received');

    const result = await triggerPromptEvolution();

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Prompt evolution completed. New version: ${result.new_version}`,
        new_version: result.new_version,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: result.error || 'Evolution skipped',
        error: result.error,
      }, { status: 200 }); // 200 because it's expected behavior
    }
  } catch (error: unknown) {
    console.error('Error in evolution endpoint:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const maxDuration = 60; // GPT-4 calls may take time
