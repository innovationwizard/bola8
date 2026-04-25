/**
 * Prompt Optimizer for Leonardo AI
 * 
 * Optimizes prompts for better material replacement results
 */

import { Material, buildMaterialReplacementPrompt, buildMaterialReplacementNegativePrompt } from './material-library';

export interface ReplacementRequest {
  targetElement: string; // 'floor', 'chair', 'wall', etc.
  fromMaterial: Material | null;
  toMaterial: Material;
  maskRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OptimizedPrompt {
  prompt: string;
  negativePrompt: string;
  initStrength: number;
  guidanceScale: number;
}

/**
 * Optimize prompt for material replacement
 */
export function optimizeMaterialReplacementPrompt(
  replacement: ReplacementRequest,
  basePrompt?: string
): OptimizedPrompt {
  const materialPrompt = buildMaterialReplacementPrompt(
    replacement.targetElement,
    replacement.fromMaterial,
    replacement.toMaterial
  );

  // Combine with base prompt if provided
  const finalPrompt = basePrompt
    ? `${basePrompt}. ${materialPrompt}`
    : materialPrompt;

  // Determine init strength based on replacement type
  // Lower init strength = more change, higher = more preservation
  let initStrength = 0.6; // Default
  
  if (replacement.fromMaterial && replacement.toMaterial) {
    // Same category = less change needed
    if (replacement.fromMaterial.category === replacement.toMaterial.category) {
      initStrength = 0.5; // More aggressive change
    } else {
      initStrength = 0.4; // Very aggressive change for different categories
    }
  }

  // Guidance scale - higher = more adherence to prompt
  const guidanceScale = 7.5; // Slightly higher for material replacement

  const negativePrompt = buildMaterialReplacementNegativePrompt(replacement.toMaterial);

  return {
    prompt: finalPrompt,
    negativePrompt,
    initStrength,
    guidanceScale,
  };
}

/**
 * Optimize for multiple replacements
 */
export function optimizeMultipleReplacements(
  replacements: ReplacementRequest[],
  basePrompt?: string
): OptimizedPrompt {
  const replacementPrompts = replacements.map(r => 
    buildMaterialReplacementPrompt(r.targetElement, r.fromMaterial, r.toMaterial)
  ).join('. ');

  const combinedPrompt = basePrompt
    ? `${basePrompt}. ${replacementPrompts}`
    : replacementPrompts;

  // Use average init strength
  const avgInitStrength = replacements.length > 0
    ? replacements.reduce((sum, r) => {
        const strength = r.fromMaterial && r.toMaterial &&
          r.fromMaterial.category === r.toMaterial.category ? 0.5 : 0.4;
        return sum + strength;
      }, 0) / replacements.length
    : 0.6;

  // Combine all negative prompts
  const allNegativePrompts = replacements
    .map(r => buildMaterialReplacementNegativePrompt(r.toMaterial))
    .join(', ');

  return {
    prompt: combinedPrompt,
    negativePrompt: `drawn, sketch, illustration, cartoon, blurry, distorted, warped, ugly, noisy, grainy, unreal, ${allNegativePrompts}`,
    initStrength: avgInitStrength,
    guidanceScale: 8.0, // Higher for multiple changes
  };
}

/**
 * Add context-aware improvements to prompt
 */
export function enhancePromptWithContext(
  prompt: string,
  context: {
    roomType?: string;
    style?: string;
    lighting?: 'natural' | 'artificial' | 'mixed';
  }
): string {
  let enhanced = prompt;

  if (context.roomType) {
    enhanced += ` in a ${context.roomType}`;
  }

  if (context.style) {
    enhanced += `, ${context.style} style`;
  }

  if (context.lighting) {
    enhanced += `, ${context.lighting} lighting`;
  }

  return enhanced;
}

