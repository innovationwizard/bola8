/**
 * Prompt Evolution System
 *
 * Uses GPT-4 to evolve prompts based on performance data
 */

import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import {
  loadCurrentPromptVersion,
  savePromptVersion,
  setCurrentVersion,
  getNextVersion,
  type PromptVersion,
} from './prompt-loader';
import { getRecentRatings } from './db/training';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PROMPTS_DIR = path.join(process.cwd(), 'prompts');
const SYSTEM_PROMPT_PATH = path.join(PROMPTS_DIR, 'evolution-system-prompt.txt');

interface EvolvedPrompt {
  improved_prompt: string;
  changes: string[];
  reasoning: string;
  expected_improvement: string;
}

interface IssueAnalysis {
  common_issues: string[];
  avg_rating: number;
  sample_count: number;
}

/**
 * Load the evolution system prompt
 */
async function loadSystemPrompt(): Promise<string> {
  try {
    return await fs.readFile(SYSTEM_PROMPT_PATH, 'utf-8');
  } catch (error) {
    console.error('Error loading system prompt:', error);
    throw new Error('System prompt file not found');
  }
}

/**
 * Analyze recent ratings to identify common issues
 */
async function analyzeIssues(recentRatings: unknown[]): Promise<IssueAnalysis> {
  const issues: string[] = [];
  let totalRating = 0;

  for (const rating of recentRatings) {
    const ratingObj = rating as Record<string, unknown>;
    totalRating += (ratingObj.rating as number) || 0;

    // Extract issues from comments (if rating < 4)
    if ((ratingObj.rating as number) < 4 && ratingObj.comments) {
      const comment = (ratingObj.comments as string).toLowerCase();

      if (comment.includes('plano') || comment.includes('flat')) {
        issues.push('Apariencia plana/sin profundidad');
      }
      if (comment.includes('iluminación') || comment.includes('lighting')) {
        issues.push('Problemas de iluminación');
      }
      if (comment.includes('color')) {
        issues.push('Colores no realistas');
      }
      if (comment.includes('textura')) {
        issues.push('Texturas poco detalladas');
      }
      if (comment.includes('montaje') || comment.includes('photoshop')) {
        issues.push('Apariencia de montaje/composición');
      }
      if (comment.includes('profundidad') || comment.includes('depth')) {
        issues.push('Falta de profundidad');
      }
    }
  }

  // Count issue frequency
  const issueCounts = new Map<string, number>();
  issues.forEach(issue => {
    issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
  });

  // Get top issues
  const topIssues = Array.from(issueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([issue]) => issue);

  return {
    common_issues: topIssues.length > 0 ? topIssues : ['Fotorrealismo general mejorable'],
    avg_rating: recentRatings.length > 0 ? totalRating / recentRatings.length : 0,
    sample_count: recentRatings.length,
  };
}

/**
 * Evolve prompt using GPT-4
 */
async function evolvePromptWithGPT4(
  currentPrompt: string,
  analysis: IssueAnalysis
): Promise<EvolvedPrompt> {
  const systemPrompt = await loadSystemPrompt();

  const userMessage = {
    current_prompt: currentPrompt,
    avg_rating: analysis.avg_rating,
    issues: analysis.common_issues,
    sample_count: analysis.sample_count,
  };

  console.log('Calling GPT-4 for prompt evolution...');
  console.log('User message:', JSON.stringify(userMessage, null, 2));

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: JSON.stringify(userMessage),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('GPT-4 returned empty response');
    }

    const evolved = JSON.parse(content) as EvolvedPrompt;

    console.log('GPT-4 evolution result:');
    console.log('Changes:', evolved.changes);
    console.log('Reasoning:', evolved.reasoning);

    return evolved;
  } catch (error) {
    console.error('Error calling GPT-4:', error);
    throw error;
  }
}

/**
 * Create a new prompt version from evolved prompt
 */
async function createEvolvedVersion(
  currentVersion: PromptVersion,
  evolved: EvolvedPrompt,
  api: 'leonardo' | 'stablediffusion'
): Promise<PromptVersion> {
  // Determine version increment type based on changes
  const changeType = evolved.changes.some(c =>
    c.includes('reescritura') || c.includes('rewrite')
  ) ? 'major' : 'minor';

  const newVersionNumber = getNextVersion(currentVersion.version, changeType);

  const newVersion: PromptVersion = {
    version: newVersionNumber,
    created_at: new Date().toISOString(),
    created_by: 'gpt4_evolution',
    parent_version: currentVersion.version,
    leonardo: { ...currentVersion.leonardo },
    stablediffusion: { ...currentVersion.stablediffusion },
    performance: {
      avg_rating: null,
      sample_count: 0,
      win_rate: null,
      last_used: null,
    },
    metadata: {
      description: `Evolved from ${currentVersion.version} - ${evolved.expected_improvement}`,
      tags: ['evolved', 'photorealism', 'gpt4'],
      evolution_reasoning: evolved.reasoning,
      changes: evolved.changes,
    },
  };

  // Update prompt for specified API
  if (api === 'leonardo') {
    newVersion.leonardo.prompt = evolved.improved_prompt;
  } else {
    newVersion.stablediffusion.prompt = evolved.improved_prompt;
  }

  return newVersion;
}

/**
 * Main evolution trigger function
 */
export async function triggerPromptEvolution(): Promise<{
  success: boolean;
  new_version?: string;
  error?: string;
}> {
  try {
    console.log('=== Starting Prompt Evolution ===');

    // 1. Get current prompt version
    const currentVersion = await loadCurrentPromptVersion();
    console.log(`Current version: ${currentVersion.version}`);

    // 2. Get recent ratings (last 10)
    const recentRatings = await getRecentRatings(10);
    console.log(`Analyzing ${recentRatings.length} recent ratings...`);

    if (recentRatings.length < 5) {
      console.log('Not enough ratings for evolution (need at least 5)');
      return {
        success: false,
        error: 'Not enough ratings (minimum 5 required)',
      };
    }

    // 3. Analyze issues
    const analysis = await analyzeIssues(recentRatings);
    console.log('Analysis:', analysis);

    // Skip evolution if rating is already high
    if (analysis.avg_rating >= 4.5) {
      console.log('Rating already high (>= 4.5), skipping evolution');
      return {
        success: false,
        error: 'Rating already optimal',
      };
    }

    // 4. Evolve Leonardo prompt
    console.log('Evolving Leonardo prompt...');
    const leonardoEvolved = await evolvePromptWithGPT4(
      currentVersion.leonardo.prompt,
      analysis
    );

    const leonardoNewVersion = await createEvolvedVersion(
      currentVersion,
      leonardoEvolved,
      'leonardo'
    );

    // 5. Evolve Stable Diffusion prompt
    console.log('Evolving Stable Diffusion prompt...');
    const sdEvolved = await evolvePromptWithGPT4(
      currentVersion.stablediffusion.prompt,
      analysis
    );

    // Use same version number, but update SD prompt
    leonardoNewVersion.stablediffusion.prompt = sdEvolved.improved_prompt;

    // Add SD changes to metadata
    leonardoNewVersion.metadata.changes = [
      ...leonardoNewVersion.metadata.changes!,
      ...sdEvolved.changes.map(c => `[SD] ${c}`),
    ];

    // 6. Save new version
    await savePromptVersion(leonardoNewVersion);
    console.log(`New version created: ${leonardoNewVersion.version}`);

    // 7. Don't auto-promote yet - will be tested via A/B
    console.log('New version will be A/B tested before promotion');

    // TODO: Schedule A/B test (implement in future)

    console.log('=== Prompt Evolution Complete ===');

    return {
      success: true,
      new_version: leonardoNewVersion.version,
    };
  } catch (error: unknown) {
    console.error('Error in prompt evolution:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Compare performance of two prompt versions
 */
export async function compareVersionPerformance(
  versionA: string,
  versionB: string
): Promise<{
  winner: string;
  versionA_rating: number;
  versionB_rating: number;
  sample_count_a: number;
  sample_count_b: number;
}> {
  // Query ratings for both versions
  const ratingsA = await getRecentRatings(100); // Get more for filtering
  const ratingsB = await getRecentRatings(100);

  const filteredA = ratingsA.filter(r => r.prompt_version === versionA);
  const filteredB = ratingsB.filter(r => r.prompt_version === versionB);

  const avgA = filteredA.length > 0
    ? filteredA.reduce((sum, r) => sum + ((r as Record<string, unknown>).rating as number || 0), 0) / filteredA.length
    : 0;

  const avgB = filteredB.length > 0
    ? filteredB.reduce((sum, r) => sum + ((r as Record<string, unknown>).rating as number || 0), 0) / filteredB.length
    : 0;

  return {
    winner: avgA > avgB ? versionA : versionB,
    versionA_rating: avgA,
    versionB_rating: avgB,
    sample_count_a: filteredA.length,
    sample_count_b: filteredB.length,
  };
}

/**
 * Promote a version to current (after A/B test)
 */
export async function promoteVersion(version: string): Promise<void> {
  await setCurrentVersion(version);
  console.log(`Version ${version} promoted to current`);
}
