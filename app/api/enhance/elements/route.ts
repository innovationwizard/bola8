import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { STORAGE_BUCKETS, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';
import { saveImageToDatabase, findOrCreateOriginalImage } from '@/lib/db/image-storage';
import { query } from '@/lib/db';
// Composition flow → gemini-3-pro-image-preview (subject placement + retention)
import { composeImageWithGoogle } from '@/lib/google-image';

// ── Google Cloud (primary) ────────────────────────────────────────────────────
const GOOGLE_CLOUD_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

// ── Leonardo AI (commented out — do not delete) ───────────────────────────────
// const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
// const BASE_URL = 'https://cloud.leonardo.ai/api/rest/v1';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

function buildElementAdditionPrompt(
  elements: Array<{ name: string; leonardo_prompt: string; placement_hints?: string | null }>,
  placementInstructions?: string
): string {
  const elementPrompts = elements.map((el) => {
    let prompt = el.leonardo_prompt;
    if (el.placement_hints) prompt += `. ${el.placement_hints}`;
    return prompt;
  });

  let combinedPrompt = `Add the following furniture and elements to the room: ${elementPrompts.join(', ')}. `;
  combinedPrompt += 'Ensure proper scale, perspective, and integration with the existing space. ';
  combinedPrompt += 'Maintain realistic lighting and shadows. ';
  combinedPrompt += 'Elements should blend naturally with the room design.';

  if (placementInstructions) {
    combinedPrompt += ` ${placementInstructions}`;
  }

  return combinedPrompt;
}

// ============================================================================
// API ROUTE
// ============================================================================

export async function POST(request: Request) {
  try {
    if (!GOOGLE_CLOUD_API_KEY) {
      return NextResponse.json({ error: 'GOOGLE_CLOUD_API_KEY not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const projectId = formData.get('project_id') as string | null;
    const placementInstructions = formData.get('placement_instructions') as string | null;

    const elementsJson = formData.get('elements') as string | null;
    if (!elementsJson) {
      return NextResponse.json({ error: 'No elements specified' }, { status: 400 });
    }

    let elementIds: string[];
    try {
      elementIds = JSON.parse(elementsJson);
    } catch {
      return NextResponse.json({ error: 'Invalid elements JSON' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'No image' }, { status: 400 });
    }

    if (elementIds.length === 0) {
      return NextResponse.json({ error: 'At least one element is required' }, { status: 400 });
    }

    // Fetch elements from database
    const placeholders = elementIds.map((_, i) => `$${i + 1}`).join(', ');
    const elementsResult = await query(
      `SELECT id, name, name_es, leonardo_prompt, negative_prompt, placement_hints FROM elements WHERE id IN (${placeholders}) AND active = true`,
      elementIds
    );

    if (elementsResult.rows.length !== elementIds.length) {
      return NextResponse.json({ error: 'One or more elements not found or inactive' }, { status: 400 });
    }

    const elements = elementsResult.rows;

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

    // Build combined prompt
    const combinedPrompt = buildElementAdditionPrompt(elements, placementInstructions || undefined);
    console.log(`Using combined prompt: ${combinedPrompt}`);

    // ── Google Cloud composition ──────────────────────────────────────────────
    console.log('Starting Gemini 3 Pro element addition...');
    const enhancedBuffer = await composeImageWithGoogle(buffer, combinedPrompt);

    // ── Leonardo enhancement (commented out — do not delete) ─────────────────
    // console.log('Uploading to Leonardo...');
    // const uploadResult = await uploadToLeonardo(buffer);
    // const { imageId, width, height } = uploadResult;
    // const combinedNegativePrompt = elements.map(el => el.negative_prompt).filter(Boolean).join(', ') || 'cluttered, messy, distorted, low quality, blurry';
    // const generationId = await generateEnhancedImage(imageId, width, height, combinedPrompt, combinedNegativePrompt);
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

      const elementsMetadata = elements.map((el) => ({
        elementId: el.id,
        elementName: el.name,
        elementNameEs: el.name_es,
        placementHints: el.placement_hints,
      }));

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
          enhancement_type: 'elements',
          provider: 'google',
          elements: elementsMetadata.map((el) => ({
            id: el.elementId,
            name: el.elementNameEs || el.elementName || 'Elemento',
          })),
          placementInstructions: placementInstructions || null,
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
        elements: elements.map((el) => ({
          id: el.id,
          name: el.name_es || el.name,
        })),
      });
    } catch (dbError) {
      console.error('Error saving to database (continuing):', dbError);
      return NextResponse.json({
        enhancedUrl: enhancedS3Info?.location || '',
        originalS3Url: originalS3Info?.location || null,
        enhancedS3Url: enhancedS3Info?.location || null,
        projectId: projectId || null,
        elements: elements.map((el) => ({
          id: el.id,
          name: el.name_es || el.name,
        })),
        warning: 'Image saved to storage but database save failed',
      });
    }
  } catch (error: unknown) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Element addition failed' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
export const runtime = 'nodejs';
