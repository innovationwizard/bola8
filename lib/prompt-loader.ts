/**
 * Prompt Version Loader
 *
 * Manages loading and saving prompt versions for the ML learning system
 */

import fs from 'fs/promises';
import path from 'path';

const PROMPTS_DIR = path.join(process.cwd(), 'prompts');
const VERSIONS_DIR = path.join(PROMPTS_DIR, 'versions');
const EXPERIMENTS_DIR = path.join(PROMPTS_DIR, 'experiments');

export interface PromptParameters {
  prompt: string;
  negative_prompt: string;
}

export interface LeonardoParameters extends PromptParameters {
  init_strength: number;
  guidance_scale: number;
  controlnet_weight: number;
}

export interface StableDiffusionParameters extends PromptParameters {
  strength: number;
  guidance_scale: number;
  controlnet_conditioning_scale: number;
}

export interface PromptPerformance {
  avg_rating: number | null;
  sample_count: number;
  win_rate: number | null;
  last_used: string | null;
}

export interface PromptVersion {
  version: string;
  created_at: string;
  created_by: string;
  parent_version: string | null;
  leonardo: LeonardoParameters;
  stablediffusion: StableDiffusionParameters;
  performance: PromptPerformance;
  metadata: {
    description: string;
    tags: string[];
    evolution_reasoning?: string;
    changes?: string[];
  };
}

/**
 * Load the current active prompt version
 */
export async function loadCurrentPromptVersion(): Promise<PromptVersion> {
  const currentPath = path.join(VERSIONS_DIR, 'current.json');

  try {
    // Follow symlink and read file
    const content = await fs.readFile(currentPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading current prompt version:', error);
    // Fallback to v1.0.0
    return loadPromptVersion('v1.0.0');
  }
}

/**
 * Load a specific prompt version
 */
export async function loadPromptVersion(version: string): Promise<PromptVersion> {
  const versionPath = path.join(VERSIONS_DIR, `${version}.json`);

  try {
    const content = await fs.readFile(versionPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    throw new Error(`Prompt version ${version} not found`);
  }
}

/**
 * Save a new prompt version
 */
export async function savePromptVersion(version: PromptVersion): Promise<void> {
  const versionPath = path.join(VERSIONS_DIR, `${version.version}.json`);

  // Ensure version follows semantic versioning
  if (!/^v\d+\.\d+\.\d+$/.test(version.version)) {
    throw new Error('Version must follow semantic versioning (e.g., v1.0.0)');
  }

  // Check if version already exists
  try {
    await fs.access(versionPath);
    throw new Error(`Version ${version.version} already exists`);
  } catch {
    // Version doesn't exist, proceed
  }

  // Validate parent version exists (if specified)
  if (version.parent_version) {
    try {
      await loadPromptVersion(version.parent_version);
    } catch {
      throw new Error(`Parent version ${version.parent_version} not found`);
    }
  }

  // Write version file
  await fs.writeFile(
    versionPath,
    JSON.stringify(version, null, 2),
    'utf-8'
  );

  console.log(`Saved prompt version: ${version.version}`);
}

/**
 * Update current.json symlink to point to a new version
 */
export async function setCurrentVersion(version: string): Promise<void> {
  const currentPath = path.join(VERSIONS_DIR, 'current.json');
  const targetPath = `${version}.json`;

  // Verify version exists
  await loadPromptVersion(version);

  // Remove old symlink if exists
  try {
    await fs.unlink(currentPath);
  } catch {
    // Symlink doesn't exist, that's ok
  }

  // Create new symlink
  await fs.symlink(targetPath, currentPath);

  console.log(`Updated current version to: ${version}`);
}

/**
 * List all available prompt versions
 */
export async function listPromptVersions(): Promise<string[]> {
  try {
    const files = await fs.readdir(VERSIONS_DIR);
    return files
      .filter(f => f.endsWith('.json') && f !== 'current.json')
      .map(f => f.replace('.json', ''))
      .sort();
  } catch (error) {
    console.error('Error listing prompt versions:', error);
    return [];
  }
}

/**
 * Get performance statistics for a version
 */
export async function getVersionPerformance(version: string): Promise<PromptPerformance> {
  const promptVersion = await loadPromptVersion(version);
  return promptVersion.performance;
}

/**
 * Update performance statistics for a version
 */
export async function updateVersionPerformance(
  version: string,
  performance: Partial<PromptPerformance>
): Promise<void> {
  const versionPath = path.join(VERSIONS_DIR, `${version}.json`);
  const promptVersion = await loadPromptVersion(version);

  promptVersion.performance = {
    ...promptVersion.performance,
    ...performance,
  };

  await fs.writeFile(
    versionPath,
    JSON.stringify(promptVersion, null, 2),
    'utf-8'
  );
}

/**
 * Save an experiment (specific parameter combination test)
 */
export async function saveExperiment(
  experimentId: string,
  data: {
    version: string;
    parameters: Record<string, unknown>;
    results?: unknown;
  }
): Promise<void> {
  const experimentPath = path.join(EXPERIMENTS_DIR, `${experimentId}.json`);

  await fs.writeFile(
    experimentPath,
    JSON.stringify({
      ...data,
      saved_at: new Date().toISOString(),
    }, null, 2),
    'utf-8'
  );
}

/**
 * Get the next version number based on change type
 */
export function getNextVersion(
  currentVersion: string,
  changeType: 'major' | 'minor' | 'patch'
): string {
  const match = currentVersion.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error('Invalid version format');
  }

  let [, major, minor, patch] = match.map(Number);

  switch (changeType) {
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'patch':
      patch += 1;
      break;
  }

  return `v${major}.${minor}.${patch}`;
}
