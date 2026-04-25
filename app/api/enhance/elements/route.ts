import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3_BUCKETS, S3_REGION, getS3Url } from '@/lib/s3-utils';
import { saveImageToDatabase, findOrCreateOriginalImage } from '@/lib/db/image-storage';
import { query } from '@/lib/db';

// ============================================================================
// LEONARDO AI API CONFIGURATION
// ============================================================================

const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
const BASE_URL = 'https://cloud.leonardo.ai/api/rest/v1';

// Constants removed as they're not used in this file

const hasExplicitCreds =
  Boolean(process.env.AWS_ACCESS_KEY_ID) && Boolean(process.env.AWS_SECRET_ACCESS_KEY);

const s3Client = new S3Client({
  region: S3_REGION,
  credentials: hasExplicitCreds && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function uploadToLeonardo(imageBuffer: Buffer): Promise<{ imageId: string; width: number; height: number }> {
  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const originalWidth = metadata.width!;
    const originalHeight = metadata.height!;
    
    console.log(`Original dimensions: ${originalWidth}x${originalHeight}`);
    
    const maxDimension = 1024;
    const aspectRatio = originalWidth / originalHeight;
    
    let targetWidth: number, targetHeight: number;
    
    if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
      targetWidth = originalWidth;
      targetHeight = originalHeight;
    } else if (originalWidth > originalHeight) {
      targetWidth = maxDimension;
      targetHeight = Math.round(maxDimension / aspectRatio);
    } else {
      targetHeight = maxDimension;
      targetWidth = Math.round(maxDimension * aspectRatio);
    }

    // Ensure dimensions are multiples of 8
    targetWidth = Math.floor(targetWidth / 8) * 8;
    targetHeight = Math.floor(targetHeight / 8) * 8;

    // Ensure minimum dimensions
    if (targetWidth < 512) targetWidth = 512;
    if (targetHeight < 512) targetHeight = 512;

    targetWidth = Math.floor(targetWidth / 8) * 8;
    targetHeight = Math.floor(targetHeight / 8) * 8;

    const processedBuffer = await image
      .resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    const processedMetadata = await sharp(processedBuffer).metadata();
    const actualWidth = processedMetadata.width!;
    const actualHeight = processedMetadata.height!;

    const finalWidth = Math.floor(actualWidth / 8) * 8;
    const finalHeight = Math.floor(actualHeight / 8) * 8;

    const response = await fetch(`${BASE_URL}/init-image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LEONARDO_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        extension: 'jpg',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Leonardo upload init failed: ${response.status} - ${errorText}`);
    }

    const { url: uploadUrl, id: imageId, fields: fieldsString } = await response.json();

    if (typeof fieldsString !== 'string') {
      throw new Error("API Error: 'fields' was not a string.");
    }

    const fieldsObject = JSON.parse(fieldsString);
    const formData = new FormData();

    for (const [key, value] of Object.entries(fieldsObject)) {
      formData.append(key, value as string);
    }

    formData.append('file', new Blob([new Uint8Array(processedBuffer)], { type: 'image/jpeg' }), 'upload.jpg');

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok && uploadResponse.status !== 204) {
      const errorText = await uploadResponse.text();
      throw new Error(`S3 Upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    return {
      imageId,
      width: finalWidth,
      height: finalHeight,
    };
  } catch (error: unknown) {
    console.error('Upload error:', error);
    throw new Error(error instanceof Error ? error.message : 'Unknown error');
  }
}

async function generateEnhancedImage(
  imageId: string,
  width: number,
  height: number,
  prompt: string,
  negativePrompt?: string
): Promise<string> {
  const payload: Record<string, unknown> = {
    prompt,
    negative_prompt: negativePrompt || 'cluttered, messy, distorted, low quality, blurry',
    guidance_scale: 7.5,
    num_images: 1,
    scheduler: 'KLMS',
    init_image_id: imageId,
    width,
    height,
    init_strength: 0.5, // Moderate strength to add elements while preserving scene
    alchemy: true,
    photoReal: true,
  };

  const response = await fetch(`${BASE_URL}/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LEONARDO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Generation failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.sdGenerationJob.generationId;
}

async function pollForCompletion(generationId: string): Promise<string> {
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    const response = await fetch(
      `${BASE_URL}/generations/${generationId}`,
      {
        headers: {
          'Authorization': `Bearer ${LEONARDO_API_KEY}`,
        },
      }
    );

    if (!response.ok) throw new Error('Poll failed');

    const data = await response.json();
    const generation = data.generations_by_pk;

    if (generation.status === 'COMPLETE') {
      return generation.generated_images[0].url;
    }

    if (generation.status === 'FAILED') {
      throw new Error('Generation failed');
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
    attempts++;
  }

  throw new Error('Timeout');
}

async function saveEnhancedImageToS3(imageUrl: string, projectId: string | null, filename: string) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error('Failed to download enhanced image');
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    const bucketName = S3_BUCKETS.LEONARDO;
    const finalBucket = (bucketName && bucketName !== 'LEONARDO_S3_BUCKET' && !bucketName.includes('LEONARDO_S3'))
      ? bucketName
      : 'bola8-leonardo-images';

    const safeName = filename ? filename.replace(/[^a-zA-Z0-9._-]/g, '-') : 'enhanced.jpg';
    const prefix = projectId ? `enhanced/${projectId}` : 'enhanced';
    const key = `${prefix}/${Date.now()}-${safeName}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: finalBucket,
        Key: key,
        Body: buffer,
        ContentType: 'image/jpeg',
      })
    );

    return {
      bucket: finalBucket,
      key,
      location: getS3Url(finalBucket, key),
    };
  } catch (error) {
    console.error('Error saving enhanced image to S3:', error);
    return null;
  }
}

function buildElementAdditionPrompt(
  elements: Array<{ name: string; leonardo_prompt: string; placement_hints?: string | null }>,
  placementInstructions?: string
): string {
  const elementPrompts = elements.map((el) => {
    let prompt = el.leonardo_prompt;
    if (el.placement_hints) {
      prompt += `. ${el.placement_hints}`;
    }
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
    if (!LEONARDO_API_KEY) {
      return NextResponse.json({ error: 'API key missing' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const projectId = formData.get('project_id') as string | null;
    const placementInstructions = formData.get('placement_instructions') as string | null;
    
    // Parse elements JSON
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
      return NextResponse.json(
        { error: 'One or more elements not found or inactive' },
        { status: 400 }
      );
    }

    const elements = elementsResult.rows;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Get original image dimensions
    const imageMetadata = await sharp(buffer).metadata();
    const originalWidth = imageMetadata.width;
    const originalHeight = imageMetadata.height;

    // Save original to S3
    let originalS3Info = null;
    try {
      const bucketName = S3_BUCKETS.UPLOADS;
      const finalBucket = (bucketName && bucketName !== 'S3_UPLOAD_BUCKET' && !bucketName.includes('S3_')) 
        ? bucketName 
        : 'bola8-uploads';
      
      const safeName = file.name ? file.name.replace(/[^a-zA-Z0-9._-]/g, '-') : 'upload.jpg';
      const prefix = projectId ? `uploads/${projectId}/originals` : 'uploads/originals';
      const key = `${prefix}/${Date.now()}-${safeName}`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: finalBucket,
          Key: key,
          Body: buffer,
          ContentType: file.type || 'application/octet-stream',
        })
      );

      originalS3Info = {
        bucket: finalBucket,
        key,
        location: getS3Url(finalBucket, key),
      };
      console.log('Archived original upload to S3:', originalS3Info.location);
    } catch (archiveError) {
      console.error('Failed to archive original upload:', archiveError);
    }

    console.log('Uploading to Leonardo...');
    const uploadResult = await uploadToLeonardo(buffer);
    const { imageId, width, height } = uploadResult;

    // Build combined prompt
    const combinedPrompt = buildElementAdditionPrompt(elements, placementInstructions || undefined);
    const combinedNegativePrompt = elements
      .map((el) => el.negative_prompt)
      .filter(Boolean)
      .join(', ') || 'cluttered, messy, distorted, low quality, blurry';

    console.log(`Using combined prompt: ${combinedPrompt}`);
    console.log(`Using negative prompt: ${combinedNegativePrompt}`);

    console.log('Starting element addition generation...');
    const generationId = await generateEnhancedImage(
      imageId,
      width,
      height,
      combinedPrompt,
      combinedNegativePrompt
    );

    console.log('Polling...');
    const enhancedUrl = await pollForCompletion(generationId);

    // Save enhanced image to S3 and database (always, even without projectId)
    let enhancedS3Info = null;
    try {
      // Get final projectId (may be auto-created)
      const originalImageData = await findOrCreateOriginalImage(
        projectId,
        originalS3Info,
        file.name,
        file.type,
        originalWidth,
        originalHeight
      );
      const finalProjectId = originalImageData.projectId;

      // Save enhanced to S3
      enhancedS3Info = await saveEnhancedImageToS3(enhancedUrl, finalProjectId, file.name);
      if (enhancedS3Info) {
        console.log('Saved enhanced image to S3:', enhancedS3Info.location);
      }

      // Prepare elements metadata
      const elementsMetadata = elements.map((el) => ({
        elementId: el.id,
        elementName: el.name,
        elementNameEs: el.name_es,
        leonardoPrompt: el.leonardo_prompt,
        placementHints: el.placement_hints,
      }));

      // Save enhanced image to database with all metadata
      const enhancedImageRecord = await saveImageToDatabase({
        projectId: finalProjectId,
        workflowStep: 'design',
        imageType: 'enhanced',
        enhancedUrl: enhancedS3Info?.location || enhancedUrl,
        leonardoImageId: imageId,
        s3Key: enhancedS3Info?.key || null,
        s3Bucket: enhancedS3Info?.bucket || null,
        filename: file.name,
        mimeType: file.type,
        width,
        height,
        metadata: {
          enhancement_type: 'elements',
          elements: elementsMetadata.map((el: Record<string, unknown>) => ({
            id: (el.elementId as string) || elementIds[0],
            name: ((el.elementNameEs as string) || (el.elementName as string) || 'Elemento'),
          })),
          placementInstructions: placementInstructions || null,
          parameters: {
            init_strength: 0.5,
            guidance_scale: 7.5,
            width,
            height,
          },
          leonardoImageId: imageId,
          generationId,
        },
        parentImageId: originalImageData.imageId, // Link to original
      });

      console.log('✅ Enhanced image saved to database:', enhancedImageRecord.id);

      return NextResponse.json({
        enhancedUrl,
        originalS3Url: originalS3Info?.location || null,
        enhancedS3Url: enhancedS3Info?.location || null,
        leonardoImageId: imageId,
        projectId: finalProjectId, // Return final projectId (may be auto-created)
        imageId: enhancedImageRecord.id,
        version: enhancedImageRecord.version,
        elements: elements.map((el) => ({
          id: el.id,
          name: el.name_es || el.name,
        })),
      });
    } catch (dbError) {
      console.error('Error saving to database (continuing with S3 only):', dbError);
      // Still return success even if DB save fails
      return NextResponse.json({
        enhancedUrl,
        originalS3Url: originalS3Info?.location || null,
        enhancedS3Url: enhancedS3Info?.location || null,
        leonardoImageId: imageId,
        projectId: projectId || null,
        elements: elements.map((el) => ({
          id: el.id,
          name: el.name_es || el.name,
        })),
        warning: 'Image saved to S3 but database save failed',
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

