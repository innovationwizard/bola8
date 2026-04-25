/**
 * ML Service Client
 *
 * Client for communicating with the Python ML service (ECS Fargate)
 */

const ML_SERVICE_URL = process.env.ML_SERVICE_URL;

export interface ParameterSuggestion {
  api: 'leonardo' | 'stablediffusion';
  init_strength?: number;
  strength?: number;
  guidance_scale: number;
  controlnet_weight?: number;
  controlnet_conditioning_scale?: number;
}

export interface SuggestionRequest {
  mode: 'structure' | 'surfaces';
  num_suggestions: number;
}

export interface UpdateRequest {
  results: Array<{
    parameters: ParameterSuggestion;
    rating: number;
  }>;
}

/**
 * Get parameter suggestions from Bayesian optimizer
 */
export async function suggestParameters(
  request: SuggestionRequest
): Promise<ParameterSuggestion[]> {
  if (!ML_SERVICE_URL) {
    console.warn('ML_SERVICE_URL not configured, using random parameters');
    return generateRandomParameters(request.num_suggestions);
  }

  try {
    const response = await fetch(`${ML_SERVICE_URL}/ml/suggest_parameters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`ML service error: ${response.status}`);
    }

    const data = await response.json();
    return data.suggestions;
  } catch (error) {
    console.error('Error calling ML service:', error);
    console.warn('Falling back to random parameters');
    return generateRandomParameters(request.num_suggestions);
  }
}

/**
 * Update ML model with new ratings
 */
export async function updateModel(request: UpdateRequest): Promise<{
  updated: boolean;
  samples_seen: number;
  convergence_score: number;
}> {
  if (!ML_SERVICE_URL) {
    console.warn('ML_SERVICE_URL not configured, skipping update');
    return { updated: false, samples_seen: 0, convergence_score: 0 };
  }

  try {
    const response = await fetch(`${ML_SERVICE_URL}/ml/update_model`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`ML service error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating ML model:', error);
    return { updated: false, samples_seen: 0, convergence_score: 0 };
  }
}

/**
 * Check if ML service is available
 */
export async function checkMLServiceHealth(): Promise<boolean> {
  if (!ML_SERVICE_URL) {
    return false;
  }

  try {
    const response = await fetch(`${ML_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Generate random parameters (fallback when ML service unavailable)
 */
function generateRandomParameters(count: number): ParameterSuggestion[] {
  const suggestions: ParameterSuggestion[] = [];

  for (let i = 0; i < count; i++) {
    const api = i % 2 === 0 ? 'leonardo' : 'stablediffusion';

    if (api === 'leonardo') {
      suggestions.push({
        api: 'leonardo',
        init_strength: randomInRange(0.1, 0.5),
        guidance_scale: randomInRange(5.0, 12.0),
        controlnet_weight: randomInRange(0.7, 0.99),
      });
    } else {
      suggestions.push({
        api: 'stablediffusion',
        strength: randomInRange(0.1, 0.5),
        guidance_scale: randomInRange(5.0, 12.0),
        controlnet_conditioning_scale: randomInRange(0.7, 0.99),
      });
    }
  }

  return suggestions;
}

function randomInRange(min: number, max: number): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}
