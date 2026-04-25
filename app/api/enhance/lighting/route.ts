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

// Helper function to convert hex to color description
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

// Convert warmth value to temperature description
function warmthToTemperature(warmth: number): string {
  if (warmth < 20) return 'very cool, blue-tinted';
  if (warmth < 40) return 'cool, slightly blue';
  if (warmth < 60) return 'neutral white';
  if (warmth < 80) return 'warm, slightly amber';
  return 'very warm, amber-tinted';
}

// Convert position to direction description
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

// Build lighting prompt
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
  const lightingDescriptions: string[] = [];
  
  lightSources.forEach((light) => {
    const typeDesc = light.type === 'natural' 
      ? 'natural daylight' 
      : light.type === 'artificial' 
      ? 'artificial light' 
      : 'ambient light';
    
    const direction = positionToDirection(light.position.x, light.position.y, light.position.z);
    const temperature = warmthToTemperature(light.warmth);
    const colorDesc = hexToColorDescription(light.color);
    const intensity = light.strength < 30 
      ? 'soft, subtle' 
      : light.strength < 70 
      ? 'moderate' 
      : 'bright, strong';
    
    lightingDescriptions.push(
      `${typeDesc} ${direction}, ${intensity} intensity, ${temperature} tone, ${colorDesc} color`
    );
  });
  
  const overallTemp = warmthToTemperature(overallWarmth);
  const overallBright = overallBrightness < 30 
    ? 'dim, low-light' 
    : overallBrightness < 70 
    ? 'well-lit' 
    : 'bright, high-key';
  
  return `Professional interior lighting setup: ${lightingDescriptions.join('; ')}. 
          Overall atmosphere: ${overallBright} with ${overallTemp} lighting. 
          Realistic global illumination, soft shadows, natural light falloff. 
          Maintain photorealistic quality with accurate light interaction on all surfaces.`;
}

// Reuse upload function from other routes
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
      init_strength: 0.4, // Lower strength to allow more lighting changes
      alchemy: false,
      modelId: LEGACY_STRUCTURE_MODEL_ID,
      controlNet: {
        controlnetModelId: CONTROLNET_CANNY_ID,
        initImageId: imageId,
        weight: 0.7, // Slightly lower weight to allow lighting changes
        preprocessor: false,
      },
    };
    
    console.log('=== LIGHTING MODIFICATION GENERATION PAYLOAD ===');
    console.log(JSON.stringify(payload, null, 2));
    console.log('================================================');

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
    console.log('=== Lighting Modification request ===');

    if (!LEONARDO_API_KEY) {
      return NextResponse.json({ error: 'API key missing' }, { status: 500 });
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

    // Build lighting prompt
    const lightingPrompt = buildLightingPrompt(
      lightingConfig.lightSources,
      lightingConfig.overallWarmth,
      lightingConfig.overallBrightness
    );

    const basePrompt = 'ultra-realistic, photorealistic interior design render, 8k, sharp focus, realistic textures, professional lighting';
    const finalPrompt = `${basePrompt}. ${lightingPrompt}`;
    const negativePrompt = 'drawn, sketch, illustration, cartoon, blurry, distorted, warped, ugly, noisy, grainy, unreal, overexposed, underexposed, unrealistic shadows, harsh lighting';

    console.log(`Using lighting prompt: ${finalPrompt}`);

    console.log('Starting lighting modification generation...');
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
          enhancement_type: 'lighting',
          lightingConfig,
          parameters: {
            init_strength: 0.4,
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
        lightingConfig,
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
        lightingConfig,
        warning: 'Image saved to S3 but database save failed',
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

