/**
 * Google Cloud image generation — two distinct flows:
 *
 *   Creation    → imagen-4-ultra               $0.06/image
 *                 Pixel-dense photorealism; no latent reasoning needed.
 *                 SDK method: ai.models.generateImages()
 *
 *   Composition → gemini-3-pro-image-preview   $0.035/image
 *                 Gemini 3 "Nano Banana" multimodal reasoning; subject
 *                 retention, material swaps, lighting, element placement.
 *                 SDK method: ai.models.generateContent() + responseModalities IMAGE
 */

import { GoogleGenAI, SafetyFilterLevel, createUserContent } from '@google/genai';

// ── Client singleton ──────────────────────────────────────────────────────────

function getClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_CLOUD_API_KEY is not configured');
  return new GoogleGenAI({ apiKey });
}

// ── Model identifiers ─────────────────────────────────────────────────────────

export const CREATION_MODEL = 'imagen-4-ultra';
export const COMPOSITION_MODEL = 'gemini-3-pro-image-preview';

// ============================================================================
// CREATION  —  imagen-4-ultra
// Generate a photorealistic scene from a text prompt.
// Pass referenceBuffer to anchor style or structure (optional).
// ============================================================================

export async function createImageWithGoogle(
  prompt: string,
  referenceBuffer?: Buffer
): Promise<Buffer> {
  const ai = getClient();

  // referenceBuffer is accepted for caller convenience but Imagen 4 Ultra
  // text-to-image does not use it in the basic generate call. It can be
  // wired into a style/subject referenceImage when that flow is needed.
  void referenceBuffer;

  const response = await ai.models.generateImages({
    model: CREATION_MODEL,
    prompt,
    config: { numberOfImages: 1, safetyFilterLevel: SafetyFilterLevel.BLOCK_ONLY_HIGH },
  });

  const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!imageBytes) {
    const reason = response.generatedImages?.[0]?.raiFilteredReason;
    throw new Error(
      `${CREATION_MODEL} returned no image${reason ? `: ${reason}` : ''}`
    );
  }

  return Buffer.from(imageBytes, 'base64');
}

// ============================================================================
// COMPOSITION  —  gemini-3-pro-image-preview
// Edit an existing image according to a text prompt.
// Gemini 3's multimodal reasoning retains subjects, materials, and perspective
// while applying the requested changes.
// ============================================================================

export async function composeImageWithGoogle(
  imageBuffer: Buffer,
  prompt: string
): Promise<Buffer> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: COMPOSITION_MODEL,
    contents: createUserContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBuffer.toString('base64'),
        },
      },
    ]),
    config: {
      responseModalities: ['IMAGE', 'TEXT'],
    },
  });

  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts?.length) {
    throw new Error(`${COMPOSITION_MODEL} returned no content`);
  }

  const imagePart = parts.find(
    (p) => p.inlineData?.mimeType?.startsWith('image/')
  );

  if (!imagePart?.inlineData?.data) {
    const textPart = parts.find((p) => p.text);
    throw new Error(
      `${COMPOSITION_MODEL} returned no image. Model text: ${textPart?.text ?? '(none)'}`
    );
  }

  return Buffer.from(imagePart.inlineData.data, 'base64');
}
