import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { STORAGE_BUCKETS, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';
import { saveImageToDatabase, findOrCreateOriginalImage } from '@/lib/db/image-storage';
// Composition flow → gemini-3-pro-image-preview (lighting reasoning + retention)
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

function hexToColorDescription(hex: string): string {
  const colorMap: Record<string, string> = {
    '#FFFFFF': 'white',
    '#FFF8E1': 'warm white',
    '#FFE082': 'warm yellow',
    '#FFB74D': 'warm orange',
    '#FF9800': 'orange',
    '#F57C00': 'amber',
    '#E1F5FE': 'cool white',
    '#B3E5FC': 'cool blue',
    '#81D4FA': 'light blue',
    '#4FC3F7': 'blue',
    '#29B6F6': 'bright blue',
  };
  return colorMap[hex.toUpperCase()] || 'colored';
}

function warmthToTemperature(warmth: number): string {
  if (warmth < 20) return 'very cool, blue-tinted';
  if (warmth < 40) return 'cool, slightly blue';
  if (warmth < 60) return 'neutral white';
  if (warmth < 80) return 'warm, slightly amber';
  return 'very warm, amber-tinted';
}

function positionToDirection(x: number, y: number, z: number): string {
  const directions: string[] = [];
  if (x < -30) directions.push('from the left');
  if (x > 30) directions.push('from the right');
  if (y > 30) directions.push('from above');
  if (y < -30) directions.push('from below');
  if (z > 30) directions.push('from the front');
  if (z < -30) directions.push('from behind');
  if (directions.length === 0) return 'evenly distributed';
  return directions.join(' and ');
}

function buildLightingPrompt(
  lightSources: Array<{
    type: string;
    position: { x: number; y: number; z: number };
    strength: number;
    warmth: number;
    color: string;
  }>,
  overallWarmth: number,
  overallBrightness: number
): string {
  const lightingDescriptions = lightSources.map((light) => {
    const typeDesc = light.type === 'natural'
      ? 'natural daylight'
      : light.type === 'artificial'
      ? 'artificial light'
      : 'ambient light';
    const direction = positionToDirection(light.position.x, light.position.y, light.position.z);
    const temperature = warmthToTemperature(light.warmth);
    const colorDesc = hexToColorDescription(light.color);
    const intensity = light.strength < 30 ? 'soft, subtle' : light.strength < 70 ? 'moderate' : 'bright, strong';
    return `${typeDesc} ${direction}, ${intensity} intensity, ${temperature} tone, ${colorDesc} color`;
  });

  const overallTemp = warmthToTemperature(overallWarmth);
  const overallBright = overallBrightness < 30
    ? 'dim, low-light'
    : overallBrightness < 70
    ? 'well-lit'
    : 'bright, high-key';

  return `Professional interior lighting setup: ${lightingDescriptions.join('; ')}. Overall atmosphere: ${overallBright} with ${overallTemp} lighting. Realistic global illumination, soft shadows, natural light falloff. Maintain photorealistic quality with accurate light interaction on all surfaces.`;
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
    console.log('=== Lighting Modification request ===');

    if (!GOOGLE_CLOUD_API_KEY) {
      return NextResponse.json({ error: 'GOOGLE_CLOUD_API_KEY not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const projectId = formData.get('project_id') as string | null;

    const lightingConfigJson = formData.get('lightingConfig') as string | null;
    if (!lightingConfigJson) {
      return NextResponse.json({ error: 'No lighting configuration specified' }, { status: 400 });
    }

    let lightingConfig: {
      lightSources: Array<{
        type: string;
        position: { x: number; y: number; z: number };
        strength: number;
        warmth: number;
        color: string;
      }>;
      overallWarmth: number;
      overallBrightness: number;
    };

    try {
      lightingConfig = JSON.parse(lightingConfigJson);
    } catch {
      return NextResponse.json({ error: 'Invalid lighting configuration JSON' }, { status: 400 });
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

    // Build lighting prompt
    const lightingPrompt = buildLightingPrompt(
      lightingConfig.lightSources,
      lightingConfig.overallWarmth,
      lightingConfig.overallBrightness
    );
    const basePrompt = 'ultra-realistic, photorealistic interior design render, 8k, sharp focus, realistic textures, professional lighting';
    const finalPrompt = `${basePrompt}. ${lightingPrompt}`;

    console.log(`Using lighting prompt: ${finalPrompt}`);

    // ── Google Cloud composition ──────────────────────────────────────────────
    console.log('Starting Gemini 3 Pro lighting modification...');
    const enhancedBuffer = await composeImageWithGoogle(buffer, finalPrompt);

    // ── Leonardo enhancement (commented out — do not delete) ─────────────────
    // console.log('Uploading to Leonardo...');
    // const uploadResult = await uploadToLeonardo(buffer);
    // const { imageId, width, height } = uploadResult;
    // const negativePrompt = 'drawn, sketch, illustration, cartoon, blurry, distorted, warped, ugly, noisy, grainy, unreal, overexposed, underexposed, unrealistic shadows, harsh lighting';
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
          enhancement_type: 'lighting',
          provider: 'google',
          lightingConfig,
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
        lightingConfig,
      });
    } catch (dbError) {
      console.error('Error saving to database (continuing):', dbError);
      return NextResponse.json({
        enhancedUrl: enhancedS3Info?.location || '',
        originalS3Url: originalS3Info?.location || null,
        enhancedS3Url: enhancedS3Info?.location || null,
        projectId: projectId || null,
        lightingConfig,
        warning: 'Image saved to storage but database save failed',
      });
    }
  } catch (error: unknown) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lighting modification failed' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
export const runtime = 'nodejs';
