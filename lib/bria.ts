/**
 * Bria RMBG 2.0 — background removal via fal.ai.
 *
 * Used to cut layer subjects out so they can be stacked in Photoshop with
 * transparency. Production-grade edge quality (hair, glass, motion blur).
 *
 * Graceful fallback (no exceptions thrown to caller):
 *   - When FAL_API_KEY is not set      → return input as opaque PNG, log nothing.
 *   - When the Bria call fails at runtime → return input as opaque PNG, log failure
 *     row via withUsageLogging's error path.
 *
 * Callers inspect `transparencyApplied` to know whether the result has an
 * alpha channel. Either way, the buffer is always PNG so the asset-pack
 * storage pipeline can treat all layers uniformly.
 *
 * Pricing: see PRICING_USD['fal/fal-ai/bria/background/remove/rmbg'] in api-usage.ts.
 */

import sharp from 'sharp';
import { fal, FAL_AVAILABLE }            from '@/lib/fal';
import { withUsageLogging, type ApiUsageContext } from '@/lib/api-usage';

const BRIA_MODEL_ID = 'fal-ai/bria/background/remove';

export interface RemoveBackgroundResult {
  /** PNG buffer. Has alpha channel iff transparencyApplied is true. */
  buffer:              Buffer;
  /** True only when Bria actually ran and returned a transparent PNG. */
  transparencyApplied: boolean;
}

type CallContext = Partial<Omit<ApiUsageContext, 'provider' | 'model' | 'operation'>>;

/**
 * Removes the background from an image. Returns a PNG buffer regardless of
 * whether Bria ran — when transparency is unavailable, the input is re-encoded
 * as opaque PNG so callers always get a uniform format.
 */
export async function removeBackground(
  imageBuffer: Buffer,
  ctx:         CallContext = {},
): Promise<RemoveBackgroundResult> {
  // Path 1 — FAL not configured. Re-encode to PNG and return opaque.
  if (!FAL_AVAILABLE) {
    const opaquePng = await sharp(imageBuffer).png().toBuffer();
    return { buffer: opaquePng, transparencyApplied: false };
  }

  // Path 2 — FAL configured. Call Bria; on any failure, fall back to opaque PNG.
  try {
    return await withUsageLogging(
      { ...ctx, provider: 'fal', model: BRIA_MODEL_ID, operation: 'rmbg' },
      async () => {
        const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' });
        const file = new File([blob], 'input.jpg', { type: 'image/jpeg' });
        const inputUrl = await fal.storage.upload(file);

        const result = await fal.subscribe(BRIA_MODEL_ID, { input: { image_url: inputUrl } });

        const data      = result.data as { image?: { url?: string } };
        const outputUrl = data.image?.url;
        if (!outputUrl) throw new Error('Bria returned no image URL');

        const res = await fetch(outputUrl);
        if (!res.ok) throw new Error(`Bria output download failed (HTTP ${res.status})`);

        const outBuffer = Buffer.from(await res.arrayBuffer());
        return { buffer: outBuffer, transparencyApplied: true };
      },
    );
  } catch (err) {
    // withUsageLogging already logged the failure row. Don't propagate — fall back.
    console.warn('[bria] removeBackground failed, returning opaque PNG:', err);
    const opaquePng = await sharp(imageBuffer).png().toBuffer();
    return { buffer: opaquePng, transparencyApplied: false };
  }
}
