import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { STORAGE_BUCKETS, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';
import { getMaterialById } from '@/lib/material-library';
import { optimizeMaterialReplacementPrompt, optimizeMultipleReplacements, ReplacementRequest } from '@/lib/prompt-optimizer';
import { saveImageToDatabase, findOrCreateOriginalImage } from '@/lib/db/image-storage';
// Composition flow → gemini-3-pro-image-preview (material/element reasoning)
import { composeImageWithGoogle } from '@/lib/google-image';

// ── Google Cloud (primary) ────────────────────────────────────────────────────
const GOOGLE_CLOUD_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

// ── Leonardo AI (commented out — do not delete) ───────────────────────────────
// const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
// const BASE_URL = 'https://cloud.leonardo.ai/api/rest/v1';
// const CONTROLNET_CANNY_ID = '20660B5C-3A83-406A-B233-6AAD728A3267';
// const LEGACY_STRUCTURE_MODEL_ID = 'ac614f96-1082-45bf-be9d-757f2d31c174';

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
// async function uploadToLeonardo(imageBuffer: Buffer): Promise<{ imageId: string; width: number; height: number }> {
//   const image = sharp(imageBuffer);
//   const metadata = await image.metadata();
//   const originalWidth = metadata.width!;
//   const originalHeight = metadata.height!;
//   const maxDimension = 1024;
//   const aspectRatio = originalWidth / originalHeight;
//   let targetWidth: number, targetHeight: number;
//   if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
//     targetWidth = originalWidth; targetHeight = originalHeight;
//   } else if (originalWidth > originalHeight) {
//     targetWidth = maxDimension; targetHeight = Math.round(maxDimension / aspectRatio);
//   } else {
//     targetHeight = maxDimension; targetWidth = Math.round(maxDimension * aspectRatio);
//   }
//   targetWidth = Math.floor(targetWidth / 8) * 8;
//   targetHeight = Math.floor(targetHeight / 8) * 8;
//   if (targetWidth < 512) targetWidth = 512;
//   if (targetHeight < 512) targetHeight = 512;
//   targetWidth = Math.floor(targetWidth / 8) * 8;
//   targetHeight = Math.floor(targetHeight / 8) * 8;
//   const processedBuffer = await image.resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
//   const processedMetadata = await sharp(processedBuffer).metadata();
//   const finalWidth = Math.floor(processedMetadata.width! / 8) * 8;
//   const finalHeight = Math.floor(processedMetadata.height! / 8) * 8;
//   const initResponse = await fetch(`${BASE_URL}/init-image`, {
//     method: 'POST',
//     headers: { authorization: `Bearer ${LEONARDO_API_KEY}`, 'content-type': 'application/json' },
//     body: JSON.stringify({ extension: 'jpg' }),
//   });
//   if (!initResponse.ok) throw new Error(`Failed to init upload: ${initResponse.status}`);
//   const initData = await initResponse.json();
//   if (!initData.uploadInitImage) throw new Error('No uploadInitImage in Leonardo response');
//   const { url: uploadUrl, id: imageId, fields: fieldsString } = initData.uploadInitImage;
//   if (typeof fieldsString !== 'string') throw new Error("'fields' was not a string");
//   const fieldsObject = JSON.parse(fieldsString);
//   const formData = new FormData();
//   let foundKeyField = false;
//   for (const [key, value] of Object.entries(fieldsObject)) {
//     formData.append(key, value as string);
//     if (key.toLowerCase() === 'key') foundKeyField = true;
//   }
//   if (!foundKeyField) throw new Error("Upload failed: no 'key' field");
//   formData.append('file', new Blob([new Uint8Array(processedBuffer)], { type: 'image/jpeg' }), 'upload.jpg');
//   const uploadResponse = await fetch(uploadUrl, { method: 'POST', body: formData });
//   if (!uploadResponse.ok && uploadResponse.status !== 204) throw new Error(`S3 Upload failed: ${uploadResponse.status}`);
//   await new Promise((resolve) => setTimeout(resolve, 3000));
//   return { imageId, width: finalWidth, height: finalHeight };
// }

// function buildGenerationPayload(imageId, width, height, prompt, negativePrompt, initStrength, guidanceScale, useControlNet = true) { ... }

// async function generateEnhancedImage(imageId, width, height, prompt, negativePrompt, initStrength, guidanceScale, useControlNet = true): Promise<string> { ... }

// async function pollForCompletion(generationId: string): Promise<string> { ... }

// ============================================================================
// API ROUTE
// ============================================================================

export async function POST(request: Request) {
  try {
    console.log('=== Targeted Enhancement request ===');

    if (!GOOGLE_CLOUD_API_KEY) {
      return NextResponse.json({ error: 'GOOGLE_CLOUD_API_KEY not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const projectId = formData.get('project_id') as string | null;

    const replacementsJson = formData.get('replacements') as string | null;
    if (!replacementsJson) {
      return NextResponse.json({ error: 'No replacements specified' }, { status: 400 });
    }

    let replacements: Array<{
      targetElement: string;
      fromMaterialId: string | null;
      toMaterialId: string;
    }>;

    try {
      replacements = JSON.parse(replacementsJson);
    } catch {
      return NextResponse.json({ error: 'Invalid replacements JSON' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'No image' }, { status: 400 });
    }

    // Validate and convert material IDs to Material objects
    const materialReplacements: ReplacementRequest[] = [];
    for (const replacement of replacements) {
      const toMaterial = getMaterialById(replacement.toMaterialId);
      if (!toMaterial) {
        return NextResponse.json(
          { error: `Material not found: ${replacement.toMaterialId}` },
          { status: 400 }
        );
      }
      const fromMaterial = replacement.fromMaterialId
        ? getMaterialById(replacement.fromMaterialId)
        : null;
      materialReplacements.push({
        targetElement: replacement.targetElement,
        fromMaterial: fromMaterial || null,
        toMaterial,
      });
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

    // Build optimized prompt
    const optimized = materialReplacements.length === 1
      ? optimizeMaterialReplacementPrompt(materialReplacements[0])
      : optimizeMultipleReplacements(materialReplacements);

    console.log(`Using optimized prompt: ${optimized.prompt}`);

    // ── Google Cloud composition ──────────────────────────────────────────────
    console.log('Starting Gemini 3 Pro targeted enhancement...');
    const enhancedBuffer = await composeImageWithGoogle(buffer, optimized.prompt);

    // ── Leonardo enhancement (commented out — do not delete) ─────────────────
    // console.log('Uploading to Leonardo...');
    // const uploadResult = await uploadToLeonardo(buffer);
    // const { imageId, width, height } = uploadResult;
    // console.log('Starting targeted generation...');
    // const generationId = await generateEnhancedImage(
    //   imageId, width, height, optimized.prompt, optimized.negativePrompt,
    //   optimized.initStrength, optimized.guidanceScale, true
    // );
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

      const replacementsMetadata = materialReplacements.map(r => ({
        targetElement: r.targetElement,
        fromMaterialId: r.fromMaterial?.id || null,
        fromMaterialName: r.fromMaterial?.name || null,
        toMaterialId: r.toMaterial.id,
        toMaterialName: r.toMaterial.name,
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
          enhancement_type: 'targeted',
          provider: 'google',
          replacements: replacementsMetadata,
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
        replacements: materialReplacements.map(r => ({
          target: r.targetElement,
          toMaterial: r.toMaterial.name,
        })),
      });
    } catch (dbError) {
      console.error('Error saving to database (continuing):', dbError);
      return NextResponse.json({
        enhancedUrl: enhancedS3Info?.location || '',
        originalS3Url: originalS3Info?.location || null,
        enhancedS3Url: enhancedS3Info?.location || null,
        projectId: projectId || null,
        replacements: materialReplacements.map(r => ({
          target: r.targetElement,
          toMaterial: r.toMaterial.name,
        })),
        warning: 'Image saved to storage but database save failed',
      });
    }
  } catch (error: unknown) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enhancement failed' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
export const runtime = 'nodejs';
