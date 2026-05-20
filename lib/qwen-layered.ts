/**
 * Qwen-Image-Layered — single-image RGBA decomposition via fal.ai.
 *
 * Takes one composed image and splits it into N transparent PNG layers.
 * The model picks the semantic split — Bola8 maps qwen's output indices to
 * our layer types (background, building, environment, etc.) downstream in
 * the asset-pack orchestration route (Batch D1).
 *
 * Graceful fallback:
 *   - When FAL_API_KEY is not set            → returns null. Caller falls back
 *                                              to per-layer generation.
 *   - When the qwen call fails at runtime    → returns null + failure log row.
 *   - When some but not all layers download → returns null (partial decomposition
 *                                              is hard to interpret reliably).
 *
 * Pricing: see PRICING_USD['fal/fal-ai/qwen-image-layered/decompose'] in
 * api-usage.ts.
 *
 * API reference: https://fal.ai/models/fal-ai/qwen-image-layered/api
 */

import { fal, FAL_AVAILABLE }                       from '@/lib/fal';
import { withUsageLogging, type ApiUsageContext }   from '@/lib/api-usage';

const QWEN_MODEL_ID = 'fal-ai/qwen-image-layered';

/** Minimum / maximum layers qwen-image-layered supports per the API spec. */
const MIN_LAYERS = 3;
const MAX_LAYERS = 10;

export interface DecomposedLayer {
  /** Position in the model's output (0..N-1). Mapping to our layer types is done by the caller. */
  index:  number;
  /** RGBA PNG buffer. */
  buffer: Buffer;
}

type CallContext = Partial<Omit<ApiUsageContext, 'provider' | 'model' | 'operation'>>;

/**
 * Decompose a composed image into transparent PNG layers. Returns null on
 * any failure path — never throws to the caller.
 */
export async function decomposeIntoLayers(
  imageBuffer: Buffer,
  numLayers:   number      = 6,
  ctx:         CallContext = {},
): Promise<DecomposedLayer[] | null> {
  if (!FAL_AVAILABLE) return null;

  const clamped = Math.max(MIN_LAYERS, Math.min(MAX_LAYERS, Math.round(numLayers)));

  try {
    return await withUsageLogging(
      { ...ctx, provider: 'fal', model: QWEN_MODEL_ID, operation: 'decompose' },
      async () => {
        const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' });
        const file = new File([blob], 'input.jpg', { type: 'image/jpeg' });
        const inputUrl = await fal.storage.upload(file);

        const result = await fal.subscribe(QWEN_MODEL_ID, {
          input: {
            image_url:     inputUrl,
            num_layers:    clamped,
            output_format: 'png',
          },
        });

        const data   = result.data as { images?: Array<{ url?: string }> };
        const images = data.images ?? [];
        if (images.length === 0) throw new Error('Qwen returned no layers');

        const downloads = await Promise.all(
          images.map(async (img, i) => {
            if (!img.url) throw new Error(`Layer ${i} has no URL`);
            const res = await fetch(img.url);
            if (!res.ok) throw new Error(`Layer ${i} download failed (HTTP ${res.status})`);
            const buf = Buffer.from(await res.arrayBuffer());
            return { index: i, buffer: buf };
          }),
        );

        return downloads;
      },
    );
  } catch (err) {
    console.warn('[qwen-layered] decomposition failed, returning null:', err);
    return null;
  }
}
