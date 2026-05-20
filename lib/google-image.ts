/**
 * Google Cloud image generation — three distinct flows:
 *
 *   Creation        → imagen-4-ultra               $0.06/image
 *                     Pixel-dense photorealism; no latent reasoning needed.
 *                     SDK method: ai.models.generateImages()
 *
 *   Composition     → gemini-3-pro-image-preview   $0.035/image
 *                     Gemini 3 multimodal reasoning; subject retention,
 *                     material swaps, lighting, element placement.
 *                     SDK method: ai.models.generateContent() + responseModalities IMAGE
 *
 *   Render-anchored → gemini-3-pro-image-preview   $0.035/image
 *                     Takes an actual project render as structural base.
 *                     Pinterest Inspo images lead the style direction.
 *                     Solves "incorrect building" failure mode.
 */

import sharp from 'sharp';
import { GoogleGenAI, SafetyFilterLevel, createUserContent } from '@google/genai';

// ── Client singleton ──────────────────────────────────────────────────────────

function getClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_CLOUD_API_KEY is not configured');
  return new GoogleGenAI({ apiKey });
}

// ── Model identifiers ─────────────────────────────────────────────────────────

export const CREATION_MODEL      = 'imagen-4.0-ultra-generate-001';
export const COMPOSITION_MODEL   = 'gemini-3-pro-image-preview';
export const EXTRACTION_MODEL    = 'gemini-2.5-flash';

// ── Output dimensions (hard rule — all generated & regenerated images) ────────

export const IMAGE_WIDTH         = 1080;
export const IMAGE_HEIGHT        = 1350;
// Imagen 4 Ultra does not support 4:5. Use 3:4 (closest portrait ratio),
// then resize to exact output dimensions via sharp.
export const IMAGE_ASPECT_RATIO  = '3:4';

async function resizeToOutput(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize(IMAGE_WIDTH, IMAGE_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 92 })
    .toBuffer();
}

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
    config: { numberOfImages: 1, aspectRatio: IMAGE_ASPECT_RATIO, safetyFilterLevel: SafetyFilterLevel.BLOCK_LOW_AND_ABOVE },
  });

  const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!imageBytes) {
    const reason = response.generatedImages?.[0]?.raiFilteredReason;
    throw new Error(
      `${CREATION_MODEL} returned no image${reason ? `: ${reason}` : ''}`
    );
  }

  return resizeToOutput(Buffer.from(imageBytes, 'base64'));
}

// ============================================================================
// COMPOSITION  —  gemini-3-pro-image-preview
// Edit an existing image according to a text prompt.
// Gemini 3's multimodal reasoning retains subjects, materials, and perspective
// while applying the requested changes.
// ============================================================================

export async function composeImageWithGoogle(
  imageBuffer: Buffer,
  prompt: string,
  styleRefBuffers?: Buffer[],
): Promise<Buffer> {
  const ai = getClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestParts: any[] = [
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: imageBuffer.toString('base64') } },
  ];

  if (styleRefBuffers?.length) {
    requestParts.push({
      text: 'Style reference images — adapt the visual style, palette, lighting, and mood of the result to match these references while preserving the subject and composition above:',
    });
    for (const buf of styleRefBuffers.slice(0, MAX_STYLE_REFS)) {
      requestParts.push({ inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } });
    }
  }

  const response = await ai.models.generateContent({
    model: COMPOSITION_MODEL,
    contents: createUserContent(requestParts),
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

  return resizeToOutput(Buffer.from(imagePart.inlineData.data, 'base64'));
}

// ============================================================================
// STYLE ADAPTATION  —  gemini-3-pro-image-preview
// Take an Imagen-generated base image and shift its visual style to match
// a set of project reference images without changing the subject or composition.
// Up to MAX_STYLE_REFS reference images are used (most recent first).
// ============================================================================

export const MAX_STYLE_REFS = 3;

export async function applyStyleReferences(
  baseImageBuffer: Buffer,
  styleRefBuffers: Buffer[],
): Promise<Buffer> {
  const ai = getClient();

  const stylePrompt =
    'You are given a generated marketing image followed by visual style reference images. ' +
    'Preserve the exact subject, composition, and concept of the generated image. ' +
    'Adapt its color palette, lighting, texture, mood, and photographic style to closely match the reference images. ' +
    'Output a single photorealistic image at the same framing.';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inlineParts: any[] = [
    { text: stylePrompt },
    { inlineData: { mimeType: 'image/jpeg', data: baseImageBuffer.toString('base64') } },
    ...styleRefBuffers.slice(0, MAX_STYLE_REFS).map((buf) => ({
      inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') },
    })),
  ];

  const response = await ai.models.generateContent({
    model: COMPOSITION_MODEL,
    contents: createUserContent(inlineParts),
    config: { responseModalities: ['IMAGE', 'TEXT'] },
  });

  const parts = response.candidates?.[0]?.content?.parts;
  const imagePart = parts?.find((p) => p.inlineData?.mimeType?.startsWith('image/'));

  if (!imagePart?.inlineData?.data) {
    const textPart = parts?.find((p) => p.text);
    throw new Error(
      `${COMPOSITION_MODEL} returned no image during style adaptation. Model text: ${textPart?.text ?? '(none)'}`
    );
  }

  return resizeToOutput(Buffer.from(imagePart.inlineData.data, 'base64'));
}

// ============================================================================
// RENDER-ANCHORED GENERATION  —  gemini-3-pro-image-preview
// Use an actual project render as the structural base so the correct building
// is always present. Pinterest Inspo images lead the style direction;
// project-level style refs provide supporting visual context.
//
// styleRefBuffers order: Pinterest Inspo first (highest weight), then project
// style refs. The composition prompt names them explicitly so the model knows
// which have priority.
// ============================================================================

export async function generateFromRender(
  renderBuffer: Buffer,
  prompt: string,
  styleRefBuffers: Buffer[], // Pinterest Inspo first, then project style refs
  pinterestCount: number,    // how many of the styleRefBuffers are Pinterest Inspo
): Promise<Buffer> {
  const ai = getClient();

  const pinterestRefs  = styleRefBuffers.slice(0, pinterestCount);
  const projectRefs    = styleRefBuffers.slice(pinterestCount, pinterestCount + MAX_STYLE_REFS);

  const systemText =
    'You are a professional marketing image composer for a real estate development. ' +
    'You will be given: (1) an actual architectural render of the property, ' +
    '(2) Pinterest inspiration images that define the visual style for this specific post, ' +
    'and (3) optional project-wide brand style references. ' +
    'Your task: create a photorealistic marketing image that uses the property render as the ' +
    'structural foundation — the architecture and setting must be recognizable and accurate — ' +
    'while applying the mood, palette, lighting, and atmosphere from the inspiration images. ' +
    'The result must look like a professional real estate marketing photograph, not a composite. ' +
    'Do not change the building architecture. Do not add invented structures. ' +
    'Output a single image at 1080×1350px (portrait 4:5).';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [
    { text: systemText },
    { text: 'PROPERTY RENDER — structural anchor (preserve architecture):' },
    { inlineData: { mimeType: 'image/jpeg', data: renderBuffer.toString('base64') } },
    { text: prompt },
  ];

  if (pinterestRefs.length > 0) {
    parts.push({
      text: `PINTEREST INSPIRATION (${pinterestRefs.length} image${pinterestRefs.length > 1 ? 's' : ''}) — highest priority style direction for this specific post. Match the mood, palette, lighting, and atmosphere:`,
    });
    for (const buf of pinterestRefs) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } });
    }
  }

  if (projectRefs.length > 0) {
    parts.push({
      text: 'PROJECT BRAND STYLE REFERENCES — supporting visual context (secondary priority):',
    });
    for (const buf of projectRefs.slice(0, MAX_STYLE_REFS)) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } });
    }
  }

  const response = await ai.models.generateContent({
    model: COMPOSITION_MODEL,
    contents: createUserContent(parts),
    config: { responseModalities: ['IMAGE', 'TEXT'] },
  });

  const responseParts = response.candidates?.[0]?.content?.parts;
  const imagePart = responseParts?.find((p) => p.inlineData?.mimeType?.startsWith('image/'));

  if (!imagePart?.inlineData?.data) {
    const textPart = responseParts?.find((p) => p.text);
    throw new Error(
      `${COMPOSITION_MODEL} returned no image in render-anchored generation. Model text: ${textPart?.text ?? '(none)'}`
    );
  }

  return resizeToOutput(Buffer.from(imagePart.inlineData.data, 'base64'));
}

// ============================================================================
// BRAND EXTRACTION  —  gemini-2.0-flash
// Parse brand guideline PDFs and/or images into structured JSON.
// Each file must be provided as { mimeType, data: base64string }.
// ============================================================================

export async function extractBrandFromDocuments(
  systemPrompt: string,
  files: Array<{ mimeType: string; data: string }>,
): Promise<string> {
  const ai = getClient();

  const inlineParts = files.map((f) => ({
    inlineData: { mimeType: f.mimeType, data: f.data },
  }));

  const response = await ai.models.generateContent({
    model: EXTRACTION_MODEL,
    contents: createUserContent([
      { text: systemPrompt },
      ...inlineParts,
    ]),
    config: { responseMimeType: 'application/json' },
  });

  const text = response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
  if (!text) throw new Error('Gemini returned no text for brand extraction');
  return text;
}
