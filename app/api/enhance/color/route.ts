import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3_BUCKETS, S3_REGION, getS3Url } from '@/lib/s3-utils';
import { saveImageToDatabase, findOrCreateOriginalImage } from '@/lib/db/image-storage';

// ============================================================================
// LEONARDO AI API CONFIGURATION
// ============================================================================

const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
const BASE_URL = 'https://cloud.leonardo.ai/api/rest/v1';

const CONTROLNET_CANNY_ID = '20660B5C-3A83-406A-B233-6AAD728A3267';
const LEGACY_STRUCTURE_MODEL_ID = 'ac614f96-1082-45bf-be9d-757f2d31c174';

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

// Helper function to convert hex to color name
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

// Build prompt for color replacement
function buildColorReplacementPrompt(
  targetElement: string,
  fromColor: string | null,
  toColor: string
): string {
  const toColorName = hexToColorName(toColor);
  
  if (fromColor) {
    const fromColorName = hexToColorName(fromColor);
    return `Change the ${targetElement} color from ${fromColorName} to ${toColorName}. 
            Maintain the same material texture and finish. 
            Keep realistic lighting, shadows, and perspective. 
            The color change should look natural and professionally applied.`;
  } else {
    return `Change the ${targetElement} color to ${toColorName}. 
            Maintain the same material texture and finish. 
            Keep realistic lighting, shadows, and perspective. 
            The color change should look natural and professionally applied.`;
  }
}

// Reuse upload and generation functions from targeted route
async function uploadToLeonardo(imageBuffer: Buffer): Promise<{ imageId: string; width: number; height: number }> {
  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const originalWidth = metadata.width!;
    const originalHeight = metadata.height!;
    
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
    
    targetWidth = Math.floor(targetWidth / 8) * 8;
    targetHeight = Math.floor(targetHeight / 8) * 8;
    
    if (targetWidth < 512) targetWidth = 512;
    if (targetHeight < 512) targetHeight = 512;
    
    targetWidth = Math.floor(targetWidth / 8) * 8;
    targetHeight = Math.floor(targetHeight / 8) * 8;
    
    const processedBuffer = await image
      .resize(targetWidth, targetHeight, { 
        fit: 'inside', 
        withoutEnlargement: true 
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    const processedMetadata = await sharp(processedBuffer).metadata();
    const finalWidth = Math.floor(processedMetadata.width! / 8) * 8;
    const finalHeight = Math.floor(processedMetadata.height! / 8) * 8;

    const initResponse = await fetch(`${BASE_URL}/init-image`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${LEONARDO_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ extension: 'jpg' }),
    });

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      throw new Error(`Failed to init upload: ${initResponse.status} - ${errorText}`);
    }

    const initData = await initResponse.json();

    if (!initData.uploadInitImage) {
      throw new Error('API Error: The /init-image response did not contain "uploadInitImage".');
    }

    const { url: uploadUrl, id: imageId, fields: fieldsString } = initData.uploadInitImage;

    if (typeof fieldsString !== 'string') {
      throw new Error("API Error: 'fields' was not a string. API may have changed.");
    }

    const fieldsObject = JSON.parse(fieldsString);
    const formData = new FormData();
    let foundKeyField = false;

    for (const [key, value] of Object.entries(fieldsObject)) {
      formData.append(key, value as string);
      if (key.toLowerCase() === 'key') {
        foundKeyField = true;
      }
    }

    if (!foundKeyField) {
      throw new Error("Upload failed: Parsed fields did not return a 'key'.");
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
  negativePrompt: string
): Promise<string> {
  try {
    const payload = {
      prompt,
      negative_prompt: negativePrompt,
      guidance_scale: 7.5,
      num_images: 1,
      scheduler: 'KLMS',
      init_image_id: imageId,
      width,
      height,
      init_strength: 0.5, // Moderate strength for color changes
      alchemy: false,
      modelId: LEGACY_STRUCTURE_MODEL_ID,
      controlNet: {
        controlnetModelId: CONTROLNET_CANNY_ID,
        initImageId: imageId,
        weight: 0.75,
        preprocessor: false,
      },
    };
    
    console.log('=== COLOR REPLACEMENT GENERATION PAYLOAD ===');
    console.log(JSON.stringify(payload, null, 2));
    console.log('===========================================');

    const response = await fetch(`${BASE_URL}/generations`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${LEONARDO_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Generation Error:', error);
      throw new Error(JSON.stringify(error));
    }

    const data = await response.json();
    return data.sdGenerationJob.generationId;
  } catch (error) {
    throw error;
  }
}

async function pollForCompletion(generationId: string): Promise<string> {
  const maxAttempts = 60;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await fetch(`${BASE_URL}/generations/${generationId}`, {
      headers: { authorization: `Bearer ${LEONARDO_API_KEY}` },
    });

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

// ============================================================================
// API ROUTE
// ============================================================================

export async function POST(request: Request) {
  try {
    console.log('=== Color Replacement request ===');

    if (!LEONARDO_API_KEY) {
      return NextResponse.json({ error: 'API key missing' }, { status: 500 });
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

    // Build combined prompt for all color replacements
    const colorPrompts = replacements.map(r => 
      buildColorReplacementPrompt(r.targetElement, r.fromColor, r.toColor)
    );
    const combinedPrompt = colorPrompts.join('. ');

    const basePrompt = 'ultra-realistic, photorealistic interior design render, 8k, sharp focus, realistic textures, realistic global illumination and soft shadows';
    const finalPrompt = `${basePrompt}. ${combinedPrompt}`;
    const negativePrompt = 'drawn, sketch, illustration, cartoon, blurry, distorted, warped, ugly, noisy, grainy, unreal, color bleeding, unrealistic color transitions';

    console.log(`Using color replacement prompt: ${finalPrompt}`);

    console.log('Starting color replacement generation...');
    const generationId = await generateEnhancedImage(
      imageId,
      width,
      height,
      finalPrompt,
      negativePrompt
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
          enhancement_type: 'color',
          replacements: replacements.map(r => ({
            targetElement: r.targetElement,
            fromColor: r.fromColor,
            toColor: r.toColor,
          })),
          parameters: {
            init_strength: 0.5,
            guidance_scale: 7.5,
            width,
            height,
          },
          leonardoImageId: imageId,
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
        replacements: replacements.map(r => ({
          target: r.targetElement,
          toColor: r.toColor,
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
        replacements: replacements.map(r => ({
          target: r.targetElement,
          toColor: r.toColor,
        })),
        warning: 'Image saved to S3 but database save failed',
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

