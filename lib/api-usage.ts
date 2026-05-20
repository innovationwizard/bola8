/**
 * API usage logging — operator-only cost tracking.
 *
 * Every paid API call (Google Imagen, Gemini, fal.ai Bria, fal.ai Qwen) is logged
 * to api_usage_logs with model, operation, latency, cost, and contextual IDs.
 *
 * Logging is fire-and-forget: a DB failure in the logging path must NEVER block
 * the user-facing API call. We swallow logging errors after console.error().
 *
 * Costs are never surfaced to end users — see [[feedback-hide-costs-from-users]].
 * Visibility is via /admin/usage (operator-only, gated by SUPERUSER_EMAILS).
 */

import { query } from '@/lib/db';

// ── Pricing table (USD per call) ──────────────────────────────────────────────
// Flat per-image rates. Token-based models (e.g. gemini-2.5-flash extract) use a
// nominal flat cost since extraction calls are rare and small.
//
// Key format: `${provider}/${model}/${operation}`
//
// Update this table when provider pricing changes. The `calculateCost` helper
// falls back to 0 (logged) for unknown combinations so a missing entry never
// breaks a request.

export const PRICING_USD: Record<string, number> = {
  // Google — image generation
  'google/imagen-4.0-ultra-generate-001/create':  0.060,
  'google/gemini-3-pro-image-preview/compose':    0.035,
  'google/gemini-3-pro-image-preview/style':      0.035,
  'google/gemini-3-pro-image-preview/render':     0.035,
  'google/gemini-3-pro-image-preview/layer':      0.035,

  // Google — text/extract
  'google/gemini-2.5-flash/extract':              0.001,

  // fal.ai
  'fal/fal-ai/bria/background/remove/rmbg':       0.003,
  'fal/fal-ai/qwen-image-layered/decompose':      0.050,
};

export function calculateCost(
  provider: string,
  model:    string,
  operation: string,
  imageCount: number = 1,
): number {
  const key  = `${provider}/${model}/${operation}`;
  const rate = PRICING_USD[key];
  if (rate == null) {
    console.warn(`[api-usage] no pricing entry for "${key}" — logging cost as 0`);
    return 0;
  }
  return Number((rate * imageCount).toFixed(6));
}

// ── Context describing the call being made ────────────────────────────────────

export interface ApiUsageContext {
  route?:        string;
  provider:      'google' | 'fal';
  model:         string;
  operation:     string;             // 'create' | 'compose' | 'render' | 'layer' | 'style' | 'extract' | 'rmbg' | 'decompose'
  postId?:       string | null;
  projectId?:    string | null;
  assetPackId?:  string | null;
  layerType?:    string | null;
  userEmail?:    string | null;
}

export interface ApiUsageResult {
  success:       boolean;
  imageCount?:   number;
  inputTokens?:  number;
  outputTokens?: number;
  latencyMs:     number;
  errorMessage?: string;
}

// ── Direct logger ─────────────────────────────────────────────────────────────

export async function logApiCall(
  ctx:    ApiUsageContext,
  result: ApiUsageResult,
): Promise<void> {
  const imageCount = result.imageCount ?? 1;
  const cost       = result.success
    ? calculateCost(ctx.provider, ctx.model, ctx.operation, imageCount)
    : 0;

  try {
    await query(
      `INSERT INTO api_usage_logs
         (route, provider, model, operation,
          input_tokens, output_tokens, image_count, cost_usd,
          latency_ms, user_email,
          post_id, project_id, asset_pack_id, layer_type,
          success, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        ctx.route        ?? null,
        ctx.provider,
        ctx.model,
        ctx.operation,
        result.inputTokens  ?? null,
        result.outputTokens ?? null,
        imageCount,
        cost,
        Math.round(result.latencyMs),
        ctx.userEmail    ?? null,
        ctx.postId       ?? null,
        ctx.projectId    ?? null,
        ctx.assetPackId  ?? null,
        ctx.layerType    ?? null,
        result.success,
        result.errorMessage ?? null,
      ],
    );
  } catch (err) {
    // Never block on logging. Operator can see the loss as a gap in /admin/usage.
    console.error('[api-usage] failed to insert log row:', err);
  }
}

// ── Wrapper helper — times + logs around a paid call ──────────────────────────

export async function withUsageLogging<T>(
  ctx: ApiUsageContext,
  fn:  () => Promise<T>,
  imageCount: number = 1,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    void logApiCall(ctx, {
      success:    true,
      imageCount,
      latencyMs:  Date.now() - start,
    });
    return result;
  } catch (err) {
    void logApiCall(ctx, {
      success:      false,
      imageCount,
      latencyMs:    Date.now() - start,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
