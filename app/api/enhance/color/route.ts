import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { STORAGE_BUCKETS, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';
import { saveImageToDatabase, findOrCreateOriginalImage } from '@/lib/db/image-storage';
// Composition flow → gemini-3-pro-image-preview (color reasoning + retention)
import { composeImageWithGoogle } from '@/lib/google-image';

// ── Google Cloud (primary) ────────────────────────────────────────────────────
const GOOGLE_CLOUD_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

// ── Leonardo AI (commented out — do not delete) ───────────────────────────────
// const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
// const BASE_URL = 'https://cloud.leonardo.ai/api/rest/v1';
// const CONTROLNET_CANNY_ID = '20660B5C-3A83-406A-B233-6AAD728A3267';
// const LEGACY_STRUCTURE_MODEL_ID = 'ac614f96-1082-45bf-be9d-757f2d31c174';

// ============================================================================
// HELPERS
// ============================================================================

function hexToColorName(hex: string): string {
  const colorMap: Record<string, string> = {
    '#FFFFFF': 'white',
    '#000000': 'black',
    '#E5E5E5': 'light gray',
    '#808080': 'gray',
    '#404040': 'dark gray',
    '#F5F5DC': 'beige',
    '#D4A574': 'light brown',
    '#8B4513': 'brown',
    '#654321': 'dark brown',
    '#87CEEB': 'light blue',
    '#4169E1': 'blue',
    '#90EE90': 'light green',
    '#228B22': 'green',
    '#DC143C': 'red',
    '#8B0000': 'dark red',
  };
  return colorMap[hex.toUpperCase()] || hex;
}

function buildColorReplacementPrompt(
  targetElement: string,
  fromColor: string | null,
  toColor: string
): string {
  const toColorName = hexToColorName(toColor);
  if (fromColor) {
    const fromColorName = hexToColorName(fromColor);
    return `Change the ${targetElement} color from ${fromColorName} to ${toColorName}. Maintain the same material texture and finish. Keep realistic lighting, shadows, and perspective. The color change should look natural and professionally applied.`;
  }
  return `Change the ${targetElement} color to ${toColorName}. Maintain the same material texture and finish. Keep realistic lighting, shadows, and perspective. The color change should look natural and professionally applied.`;
}

async function saveEnhancedBufferToStorage(
  imageBuffer: Buffer,
  projectId: string | null,
  filename: string
) {
  try {
    const safeName = (filename || 'enhanced.jpg').replace(/[^a-zA-Z0-9._-]/g, '-');
    const storagePath = `enhanced/${projectId || 'unknown'}/${Date.now()}-${safeName}`;
    await uploadBuffer(STORAGE_BUCKETS.COMPOSITIONS, storagePath, imageBuffer, 'image/jpeg');
    return {
      bucket: STORAGE_BUCKETS.COMPOSITIONS,
      key: storagePath,
      location: getPublicUrl(STORAGE_BUCKETS.COMPOSITIONS, storagePath),
    };
  } catch (error) {
    console.error('Error saving enhanced image to storage:', error);
    return null;
  }
}

// ── Leonardo helpers (commented out — do not delete) ─────────────────────────
// async function uploadToLeonardo(imageBuffer: Buffer): Promise<{ imageId: string; width: number; height: number }> { ... }
// async function generateEnhancedImage(imageId, width, height, prompt, negativePrompt): Promise<string> { ... }
// async function pollForCompletion(generationId: string): Promise<string> { ... }

// ============================================================================
// API ROUTE
// ============================================================================

export async function POST(request: Request) {
  try {
    console.log('=== Color Replacement request ===');

    if (!GOOGLE_CLOUD_API_KEY) {
      return NextResponse.json({ error: 'GOOGLE_CLOUD_API_KEY not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const projectId = formData.get('project_id') as string | null;

    const replacementsJson = formData.get('replacements') as string | null;
    if (!replacementsJson) {
      return NextResponse.json({ error: 'No color replacements specified' }, { status: 400 });
    }

    let replacements: Array<{
      targetElement: string;
      fromColor: string | null;
      toColor: string;
    }>;

    try {
      replacements = JSON.parse(replacementsJson);
    } catch {
      return NextResponse.json({ error: 'Invalid replacements JSON' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'No image' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const imageMetadata = await sharp(buffer).metadata();
    const originalWidth = imageMetadata.width;
    const originalHeight = imageMetadata.height;

    let originalS3Info = null;
    try {
      const safeName = (file.name || 'upload.jpg').replace(/[^a-zA-Z0-9._-]/g, '-');
      const storagePath = `${projectId ? `uploads/${projectId}/originals` : 'uploads/originals'}/${Date.now()}-${safeName}`;
      await uploadBuffer(STORAGE_BUCKETS.UPLOADS, storagePath, buffer, file.type || 'image/jpeg');
      originalS3Info = {
        bucket: STORAGE_BUCKETS.UPLOADS,
        key: storagePath,
        location: getPublicUrl(STORAGE_BUCKETS.UPLOADS, storagePath),
      };
    } catch (archiveError) {
      console.error('Failed to archive original upload:', archiveError);
    }

    // Build combined prompt for all color replacements
    const colorPrompts = replacements.map(r =>
      buildColorReplacementPrompt(r.targetElement, r.fromColor, r.toColor)
    );
    const basePrompt = 'ultra-realistic, photorealistic interior design render, 8k, sharp focus, realistic textures, realistic global illumination and soft shadows';
    const finalPrompt = `${basePrompt}. ${colorPrompts.join('. ')}`;

    console.log(`Using color replacement prompt: ${finalPrompt}`);

    // ── Google Cloud composition ──────────────────────────────────────────────
    console.log('Starting Gemini 3 Pro color replacement...');
    const enhancedBuffer = await composeImageWithGoogle(buffer, finalPrompt);

    // ── Leonardo enhancement (commented out — do not delete) ─────────────────
    // console.log('Uploading to Leonardo...');
    // const uploadResult = await uploadToLeonardo(buffer);
    // const { imageId, width, height } = uploadResult;
    // const negativePrompt = 'drawn, sketch, illustration, cartoon, blurry, distorted, warped, ugly, noisy, grainy, unreal, color bleeding, unrealistic color transitions';
    // const generationId = await generateEnhancedImage(imageId, width, height, finalPrompt, negativePrompt);
    // console.log('Polling...');
    // const enhancedUrl = await pollForCompletion(generationId);

    let enhancedS3Info = null;
    try {
      const originalImageData = await findOrCreateOriginalImage(
        projectId,
        originalS3Info,
        file.name,
        file.type,
        originalWidth,
        originalHeight
      );
      const finalProjectId = originalImageData.projectId;

      enhancedS3Info = await saveEnhancedBufferToStorage(enhancedBuffer, finalProjectId, file.name);
      if (enhancedS3Info) {
        console.log('Saved enhanced image to storage:', enhancedS3Info.location);
      }

      const enhancedImageRecord = await saveImageToDatabase({
        projectId: finalProjectId,
        workflowStep: 'design',
        imageType: 'enhanced',
        enhancedUrl: enhancedS3Info?.location || '',
        s3Key: enhancedS3Info?.key || null,
        s3Bucket: enhancedS3Info?.bucket || null,
        filename: file.name,
        mimeType: file.type,
        width: originalWidth || 0,
        height: originalHeight || 0,
        metadata: {
          enhancement_type: 'color',
          provider: 'google',
          replacements: replacements.map(r => ({
            targetElement: r.targetElement,
            fromColor: r.fromColor,
            toColor: r.toColor,
          })),
        },
        parentImageId: originalImageData.imageId,
      });

      console.log('✅ Enhanced image saved to database:', enhancedImageRecord.id);

      return NextResponse.json({
        enhancedUrl: enhancedS3Info?.location || '',
        originalS3Url: originalS3Info?.location || null,
        enhancedS3Url: enhancedS3Info?.location || null,
        projectId: finalProjectId,
        imageId: enhancedImageRecord.id,
        version: enhancedImageRecord.version,
        replacements: replacements.map(r => ({
          target: r.targetElement,
          toColor: r.toColor,
        })),
      });
    } catch (dbError) {
      console.error('Error saving to database (continuing):', dbError);
      return NextResponse.json({
        enhancedUrl: enhancedS3Info?.location || '',
        originalS3Url: originalS3Info?.location || null,
        enhancedS3Url: enhancedS3Info?.location || null,
        projectId: projectId || null,
        replacements: replacements.map(r => ({
          target: r.targetElement,
          toColor: r.toColor,
        })),
        warning: 'Image saved to storage but database save failed',
      });
    }
  } catch (error: unknown) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Color replacement failed' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
export const runtime = 'nodejs';
