import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3_BUCKETS, S3_REGION, getS3Url } from '@/lib/s3-utils';
import { saveImageToDatabase, findOrCreateOriginalImage } from '@/lib/db/image-storage';
import Replicate from 'replicate';

// ============================================================================
// LEONARDO AI API CONFIGURATION
// ============================================================================

const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const BASE_URL = 'https://cloud.leonardo.ai/api/rest/v1';

// Initialize Replicate client
const replicate = REPLICATE_API_TOKEN ? new Replicate({ auth: REPLICATE_API_TOKEN }) : null;

const CONTROLNET_CANNY_ID = '20660B5C-3A83-406A-B233-6AAD728A3267';
const LEGACY_STRUCTURE_MODEL_ID = 'ac614f96-1082-45bf-be9d-757f2d31c174';
// Optimized prompts for maximum preservation and photorealism
const PROMPT =
  'ultra-realistic, photorealistic interior design render, 8k, sharp focus, realistic textures on all surfaces, rich wood grain, soft fabric, polished marble, realistic global illumination and soft shadows, preserve exact layout, preserve exact elements, preserve exact materials, preserve exact colors, professional photography quality';
const NEGATIVE_PROMPT =
  'drawn, sketch, illustration, cartoon, blurry, distorted, warped, ugly, noisy, grainy, unreal, material changes, color changes, element modifications, flat, montage, photoshop composition';
const hasExplicitCreds =
  Boolean(process.env.AWS_ACCESS_KEY_ID) && Boolean(process.env.AWS_SECRET_ACCESS_KEY);

// Log bucket configuration for debugging
console.log('S3 Bucket Configuration:');
console.log(`  UPLOADS: ${S3_BUCKETS.UPLOADS}`);
console.log(`  LEONARDO: ${S3_BUCKETS.LEONARDO}`);
console.log(`  Region: ${S3_REGION}`);

const s3Client = new S3Client({
  region: S3_REGION,
  credentials: hasExplicitCreds
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

function buildGenerationPayload(imageId, width, height, mode) {
  const isStructure = mode === 'structure';

  const payload = {
    prompt: PROMPT,
    negative_prompt: NEGATIVE_PROMPT,
    guidance_scale: 7,
    num_images: 1,
    scheduler: 'KLMS',
    init_image_id: imageId,
    width: width, // Use the actual dimensions (already calculated to fit within 1024)
    height: height, // Use the actual dimensions (already calculated to fit within 1024)
    init_strength: isStructure ? 0.25 : 0.3, // Optimized: Lower strength for better preservation
    alchemy: !isStructure,
  };

  if (isStructure) {
    payload.modelId = LEGACY_STRUCTURE_MODEL_ID;
    payload.controlNet = {
      controlnetModelId: CONTROLNET_CANNY_ID,
      initImageId: imageId,
      weight: 0.92, // Optimized: Higher weight for maximum structure preservation
      preprocessor: false,
    };
  } else {
    payload.photoReal = true;
  }

  return payload;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function uploadToLeonardo(imageBuffer) {
  try {
    // 1. Get original image metadata to preserve aspect ratio
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;
    
    console.log(`Original dimensions: ${originalWidth}x${originalHeight}`);
    
    // 2. Calculate target dimensions: use original OR upscale if too small
    // Leonardo supports up to 2048x2048, but we'll use original dimensions or upscale to match/improve
    const aspectRatio = originalWidth / originalHeight;
    const minDimension = 1024; // Minimum to ensure good quality
    const maxDimension = 2048; // Leonardo's practical maximum
    
    let targetWidth, targetHeight;
    
    // If original is smaller than minimum, upscale to at least minimum while preserving aspect ratio
    if (originalWidth < minDimension && originalHeight < minDimension) {
      // Upscale to meet minimum on the larger side
      if (originalWidth >= originalHeight) {
        targetWidth = minDimension;
        targetHeight = Math.round(minDimension / aspectRatio);
      } else {
        targetHeight = minDimension;
        targetWidth = Math.round(minDimension * aspectRatio);
      }
      console.log(`Upscaling from ${originalWidth}x${originalHeight} to ${targetWidth}x${targetHeight} for better quality`);
    } else if (originalWidth > maxDimension || originalHeight > maxDimension) {
      // If larger than max, scale down to max while preserving aspect ratio
      if (originalWidth > originalHeight) {
        targetWidth = maxDimension;
        targetHeight = Math.round(maxDimension / aspectRatio);
      } else {
        targetHeight = maxDimension;
        targetWidth = Math.round(maxDimension * aspectRatio);
      }
      console.log(`Scaling down from ${originalWidth}x${originalHeight} to ${targetWidth}x${targetHeight} (max ${maxDimension})`);
    } else {
      // Use original dimensions (they're in the sweet spot)
      targetWidth = originalWidth;
      targetHeight = originalHeight;
      console.log(`Using original dimensions: ${targetWidth}x${targetHeight}`);
    }
    
    // Ensure dimensions are multiples of 8 (Leonardo requirement)
    targetWidth = Math.floor(targetWidth / 8) * 8;
    targetHeight = Math.floor(targetHeight / 8) * 8;
    
    // Ensure minimum dimensions (at least 512 on the smaller side)
    if (targetWidth < 512) targetWidth = 512;
    if (targetHeight < 512) targetHeight = 512;
    
    // Re-ensure multiples of 8 after minimum check
    targetWidth = Math.floor(targetWidth / 8) * 8;
    targetHeight = Math.floor(targetHeight / 8) * 8;
    
    console.log(`Target dimensions (preserving aspect ratio): ${targetWidth}x${targetHeight}`);
    
    // 3. Resize and process the image (upscale if needed, maintain quality)
    console.log('Preprocessing image...');
    const processedBuffer = await image
      .resize(targetWidth, targetHeight, { 
        fit: 'fill', // Use 'fill' to ensure exact dimensions (upscale if needed)
        kernel: 'lanczos3' // High-quality upscaling algorithm
      })
      .jpeg({ quality: 95, mozjpeg: true }) // Higher quality for better definition
      .toBuffer();
    
    // Verify actual output dimensions
    const processedMetadata = await sharp(processedBuffer).metadata();
    const actualWidth = processedMetadata.width;
    const actualHeight = processedMetadata.height;
    
    // Use actual dimensions (rounded to multiples of 8) for Leonardo
    const finalWidth = Math.floor(actualWidth / 8) * 8;
    const finalHeight = Math.floor(actualHeight / 8) * 8;
    
    console.log(`Actual processed dimensions: ${actualWidth}x${actualHeight}`);
    console.log(`Final dimensions for Leonardo: ${finalWidth}x${finalHeight}`);

    console.log('Image processed, getting upload URL...');

    // 4. Get upload URL from Leonardo
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
    console.log('=== LEONARDO /init-image RESPONSE ===');
    console.log(JSON.stringify(initData, null, 2));
    console.log('===================================');

    if (!initData.uploadInitImage) {
      throw new Error('API Error: The /init-image response did not contain "uploadInitImage".');
    }

    const { url: uploadUrl, id: imageId, fields: fieldsString } = initData.uploadInitImage;

    if (typeof fieldsString !== 'string') {
      throw new Error("API Error: 'fields' was not a string. API may have changed.");
    }

    console.log("Parsing 'fields' string into JSON object...");
    const fieldsObject = JSON.parse(fieldsString);

    const formData = new FormData();
    let foundKeyField = false;

    console.log('--- Appending Fields to FormData ---');
    for (const [key, value] of Object.entries(fieldsObject)) {
      console.log(`   -> Appending field: "${key}"`);
      formData.append(key, value);

      if (key.toLowerCase() === 'key') {
        foundKeyField = true;
      }
    }
    console.log('-------------------------------------');

    if (!foundKeyField) {
      console.error('CRITICAL: The parsed "fields" object did not contain a "key".');
      throw new Error("Upload failed: Parsed fields did not return a 'key'.");
    }

    formData.append('file', new Blob([processedBuffer], { type: 'image/jpeg' }), 'upload.jpg');

    console.log('Uploading to S3 with all parsed fields...');
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok && uploadResponse.status !== 204) {
      const errorText = await uploadResponse.text();
      throw new Error(`S3 Upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    console.log('Upload successful, imageId:', imageId);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Return imageId and actual dimensions (preserving aspect ratio)
    return {
      imageId,
      width: finalWidth,
      height: finalHeight,
    };
  } catch (error) {
    console.error('Upload error:', error);
    throw new Error(error.message);
  }
}

async function backupUploadToS3(buffer, filename, mimeType, projectId = null) {
  // Original uploads go to bola8-uploads bucket
  const bucketName = S3_BUCKETS.UPLOADS;
  
  // Validate bucket name
  if (!bucketName || bucketName === 'S3_UPLOAD_BUCKET' || bucketName.includes('S3_')) {
    console.error(`Invalid bucket name: ${bucketName}. Using fallback 'bola8-uploads'`);
    const fallbackBucket = 'bola8-uploads';
    console.log(`Using bucket: ${fallbackBucket}`);
  }
  
  const safeName = filename ? filename.replace(/[^a-zA-Z0-9._-]/g, '-') : 'upload.jpg';
  const prefix = projectId ? `uploads/${projectId}/originals` : 'uploads/originals';
  const key = `${prefix}/${Date.now()}-${safeName}`;

  const finalBucket = (bucketName && bucketName !== 'S3_UPLOAD_BUCKET' && !bucketName.includes('S3_')) 
    ? bucketName 
    : 'bola8-uploads';
  
  console.log(`Uploading to bucket: ${finalBucket}, key: ${key}`);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: finalBucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
    })
  );

  return {
    bucket: finalBucket,
    key,
    location: getS3Url(finalBucket, key),
  };
}

async function saveEnhancedImageToS3(imageUrl, projectId, filename) {
  try {
    // Download the enhanced image from Leonardo
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error('Failed to download enhanced image');
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    // Enhanced images go to bola8-leonardo-images bucket
    const bucketName = S3_BUCKETS.LEONARDO;
    const finalBucket = (bucketName && bucketName !== 'LEONARDO_S3_BUCKET' && !bucketName.includes('LEONARDO_S3')) 
      ? bucketName 
      : 'bola8-leonardo-images';
    
    const safeName = filename ? filename.replace(/[^a-zA-Z0-9._-]/g, '-') : 'enhanced.jpg';
    const prefix = projectId ? `enhanced/${projectId}` : 'enhanced';
    const key = `${prefix}/${Date.now()}-${safeName}`;

    console.log(`Saving enhanced image to bucket: ${finalBucket}, key: ${key}`);

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

async function generateEnhancedImage(imageId, width, height, mode) {
  try {
    const payload = buildGenerationPayload(imageId, width, height, mode);
    console.log('=== GENERATION PAYLOAD ===');
    console.log(JSON.stringify(payload, null, 2));
    console.log('==========================');

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

async function pollForCompletion(generationId) {
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

// ============================================================================
// STABLE DIFFUSION + CONTROLNET (via Replicate)
// ============================================================================

async function enhanceWithStableDiffusion(imageBuffer, originalWidth, originalHeight) {
  if (!replicate) {
    throw new Error('Replicate API token not configured');
  }

  try {
    // Get original dimensions from the buffer
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const imgWidth = metadata.width || originalWidth;
    const imgHeight = metadata.height || originalHeight;
    
    // Calculate target dimensions: use original OR upscale if too small
    // SDXL works best at 1024x1024 or higher, but we'll use original or upscale to match/improve
    const aspectRatio = imgWidth / imgHeight;
    const minDimension = 1024; // SDXL's native resolution
    const maxDimension = 2048; // Practical maximum for SDXL
    
    let targetWidth, targetHeight;
    
    // If original is smaller than minimum, upscale to at least minimum while preserving aspect ratio
    if (imgWidth < minDimension && imgHeight < minDimension) {
      // Upscale to meet minimum on the larger side
      if (imgWidth >= imgHeight) {
        targetWidth = minDimension;
        targetHeight = Math.round(minDimension / aspectRatio);
      } else {
        targetHeight = minDimension;
        targetWidth = Math.round(minDimension * aspectRatio);
      }
      console.log(`[SD] Upscaling from ${imgWidth}x${imgHeight} to ${targetWidth}x${targetHeight} for better quality`);
    } else if (imgWidth > maxDimension || imgHeight > maxDimension) {
      // If larger than max, scale down to max while preserving aspect ratio
      if (imgWidth > imgHeight) {
        targetWidth = maxDimension;
        targetHeight = Math.round(maxDimension / aspectRatio);
      } else {
        targetHeight = maxDimension;
        targetWidth = Math.round(maxDimension * aspectRatio);
      }
      console.log(`[SD] Scaling down from ${imgWidth}x${imgHeight} to ${targetWidth}x${targetHeight} (max ${maxDimension})`);
    } else {
      // Use original dimensions
      targetWidth = imgWidth;
      targetHeight = imgHeight;
      console.log(`[SD] Using original dimensions: ${targetWidth}x${targetHeight}`);
    }
    
    // Ensure dimensions are multiples of 8 (SDXL requirement)
    targetWidth = Math.floor(targetWidth / 8) * 8;
    targetHeight = Math.floor(targetHeight / 8) * 8;
    
    // Ensure minimum dimensions
    if (targetWidth < 512) targetWidth = 512;
    if (targetHeight < 512) targetHeight = 512;
    targetWidth = Math.floor(targetWidth / 8) * 8;
    targetHeight = Math.floor(targetHeight / 8) * 8;
    
    console.log(`[SD] Final dimensions: ${targetWidth}x${targetHeight}`);
    
    // Process image to target dimensions if needed (upscale with high quality)
    let processedBuffer = imageBuffer;
    if (targetWidth !== imgWidth || targetHeight !== imgHeight) {
      const processedImage = sharp(imageBuffer);
      processedBuffer = await processedImage
        .resize(targetWidth, targetHeight, {
          fit: 'fill',
          kernel: 'lanczos3' // High-quality upscaling
        })
        .jpeg({ quality: 95, mozjpeg: true })
        .toBuffer();
    }
    
    // Convert buffer to base64 for Replicate
    const base64Image = processedBuffer.toString('base64');
    const dataUri = `data:image/jpeg;base64,${base64Image}`;

    // Use Stable Diffusion XL with ControlNet for maximum structure preservation
    // Model: stability-ai/sdxl with controlnet-canny
    const output = await replicate.run(
      "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      {
        input: {
          image: dataUri,
          prompt: "ultra-realistic, photorealistic interior design render, 8k, sharp focus, realistic textures, professional photography quality, preserve exact layout, preserve exact elements, preserve exact materials, preserve exact colors",
          negative_prompt: "drawn, sketch, illustration, cartoon, blurry, distorted, warped, ugly, noisy, grainy, unreal, material changes, color changes, element modifications, flat, montage, photoshop composition",
          num_outputs: 1,
          num_inference_steps: 50, // Increased for better quality
          guidance_scale: 7.5,
          strength: 0.2, // Very low strength for maximum preservation
          width: targetWidth,
          height: targetHeight,
          // ControlNet settings (if supported by model)
          controlnet_conditioning_scale: 0.95, // Strong structure preservation
        }
      }
    );

    // Replicate returns an array of URLs
    if (Array.isArray(output) && output.length > 0) {
      return output[0];
    } else if (typeof output === 'string') {
      return output;
    } else {
      throw new Error('Unexpected output format from Replicate');
    }
  } catch (error) {
    console.error('Stable Diffusion enhancement error:', error);
    throw error;
  }
}

// ============================================================================
// API ROUTE
// ============================================================================

export async function POST(request) {
  try {
    console.log('=== Enhancement request ===');

    if (!LEONARDO_API_KEY) {
      return NextResponse.json({ error: 'API key missing' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('image');
    const modeValue = (formData.get('mode') || 'structure').toString();
    const mode = modeValue === 'surfaces' ? 'surfaces' : 'structure';
    const projectId = formData.get('project_id');
    const siteVisitId = formData.get('site_visit_id');

    if (!file) {
      return NextResponse.json({ error: 'No image' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Get original image dimensions
    const imageMetadata = await sharp(buffer).metadata();
    const originalWidth = imageMetadata.width;
    const originalHeight = imageMetadata.height;

    console.log(`Original image dimensions: ${originalWidth}x${originalHeight}`);

    // Save original to S3
    let originalS3Info = null;
    try {
      originalS3Info = await backupUploadToS3(buffer, file.name, file.type, projectId);
      if (originalS3Info) {
        console.log('Archived original upload to S3:', originalS3Info.location);
      }
    } catch (archiveError) {
      console.error('Failed to archive original upload:', archiveError);
    }

    // Get final projectId (may be auto-created) - do this before processing
    const originalImageData = await findOrCreateOriginalImage(
      projectId,
      originalS3Info,
      file.name,
      file.type,
      originalWidth,
      originalHeight
    );
    const finalProjectId = originalImageData.projectId;

    // Process both enhancements in parallel
    console.log('Starting dual enhancement (Leonardo optimized + Stable Diffusion)...');
    console.log('Ensuring output resolution >= original resolution for both options...');
    
    const enhancementPromises = [
      // Option A: Leonardo (optimized)
      (async () => {
        try {
          console.log('Processing Opción A (Leonardo optimized)...');
          console.log(`Target: resolution >= ${originalWidth}x${originalHeight}`);
          const uploadResult = await uploadToLeonardo(buffer, 'jpg');
          const { imageId, width, height } = uploadResult;
          console.log(`Leonardo will generate at ${width}x${height} (original: ${originalWidth}x${originalHeight})`);
          const generationId = await generateEnhancedImage(imageId, width, height, mode);
          const enhancedUrl = await pollForCompletion(generationId);
          return { type: 'leonardo', url: enhancedUrl, generationId, imageId, width, height };
        } catch (error) {
          console.error('Leonardo enhancement failed:', error);
          return { type: 'leonardo', error: error.message };
        }
      })(),
      // Option B: Stable Diffusion + ControlNet
      (async () => {
        try {
          console.log('Processing Opción B (Stable Diffusion + ControlNet)...');
          console.log(`Target: resolution >= ${originalWidth}x${originalHeight}`);
          const enhancedUrl = await enhanceWithStableDiffusion(buffer, originalWidth, originalHeight);
          return { type: 'stablediffusion', url: enhancedUrl };
        } catch (error) {
          console.error('Stable Diffusion enhancement failed:', error);
          return { type: 'stablediffusion', error: error.message };
        }
      })(),
    ];

    const results = await Promise.allSettled(enhancementPromises);
    
    // Process results
    let optionA = null;
    let optionB = null;
    let optionAError = null;
    let optionBError = null;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        if (data.type === 'leonardo' && !data.error) {
          optionA = data;
        } else if (data.type === 'stablediffusion' && !data.error) {
          optionB = data;
        } else if (data.error) {
          if (data.type === 'leonardo') optionAError = data.error;
          if (data.type === 'stablediffusion') optionBError = data.error;
        }
      } else {
        if (index === 0) optionAError = result.reason?.message || 'Unknown error';
        if (index === 1) optionBError = result.reason?.message || 'Unknown error';
      }
    });

    // Save both enhanced images to S3 and database
    const savedImages = [];

    try {
      // Save Option A (Leonardo)
      if (optionA && optionA.url) {
        const enhancedS3InfoA = await saveEnhancedImageToS3(optionA.url, finalProjectId, `option-a-${file.name}`);
        const enhancedImageRecordA = await saveImageToDatabase({
          projectId: finalProjectId,
          siteVisitId: siteVisitId || null,
          workflowStep: 'design',
          imageType: 'enhanced',
          enhancedUrl: enhancedS3InfoA?.location || optionA.url,
          leonardoImageId: optionA.imageId,
          s3Key: enhancedS3InfoA?.key || null,
          s3Bucket: enhancedS3InfoA?.bucket || null,
          filename: `option-a-${file.name}`,
          mimeType: file.type,
          width,
          height,
          metadata: {
            enhancement_type: 'general',
            mode,
            option: 'A',
            provider: 'leonardo',
            parameters: {
              init_strength: mode === 'structure' ? 0.25 : 0.3,
              guidance_scale: 7,
              controlnet_weight: mode === 'structure' ? 0.92 : null,
              width,
              height,
            },
            leonardoImageId: optionA.imageId,
            generationId: optionA.generationId,
          },
          parentImageId: originalImageData.imageId,
        });
        savedImages.push({
          option: 'A',
          url: enhancedS3InfoA?.location || optionA.url,
          imageId: enhancedImageRecordA.id,
          version: enhancedImageRecordA.version,
        });
        console.log('✅ Opción A saved to database:', enhancedImageRecordA.id);
      }

      // Save Option B (Stable Diffusion)
      if (optionB && optionB.url) {
        // Download the image from Replicate URL to save to S3
        const sdResponse = await fetch(optionB.url);
        if (!sdResponse.ok) {
          throw new Error('Failed to download Stable Diffusion image');
        }
        const sdBuffer = Buffer.from(await sdResponse.arrayBuffer());
        
        // Save to S3 directly (not using saveEnhancedImageToS3 which expects Leonardo URL)
        const bucketName = S3_BUCKETS.LEONARDO;
        const finalBucket = (bucketName && bucketName !== 'LEONARDO_S3_BUCKET' && !bucketName.includes('LEONARDO_S3')) 
          ? bucketName 
          : 'bola8-leonardo-images';
        
        const safeName = file.name ? file.name.replace(/[^a-zA-Z0-9._-]/g, '-') : 'enhanced.jpg';
        const prefix = finalProjectId ? `enhanced/${finalProjectId}` : 'enhanced';
        const key = `${prefix}/${Date.now()}-option-b-${safeName}`;

        await s3Client.send(
          new PutObjectCommand({
            Bucket: finalBucket,
            Key: key,
            Body: sdBuffer,
            ContentType: 'image/jpeg',
          })
        );

        const enhancedS3InfoB = {
          bucket: finalBucket,
          key,
          location: getS3Url(finalBucket, key),
        };
        const enhancedImageRecordB = await saveImageToDatabase({
          projectId: finalProjectId,
          siteVisitId: siteVisitId || null,
          workflowStep: 'design',
          imageType: 'enhanced',
          enhancedUrl: enhancedS3InfoB?.location || optionB.url,
          s3Key: enhancedS3InfoB?.key || null,
          s3Bucket: enhancedS3InfoB?.bucket || null,
          filename: `option-b-${file.name}`,
          mimeType: file.type,
          width,
          height,
          metadata: {
            enhancement_type: 'general',
            option: 'B',
            provider: 'stablediffusion',
            parameters: {
              strength: 0.2,
              guidance_scale: 7.5,
              controlnet_conditioning_scale: 0.95,
              width,
              height,
            },
          },
          parentImageId: originalImageData.imageId,
        });
        savedImages.push({
          option: 'B',
          url: enhancedS3InfoB?.location || optionB.url,
          imageId: enhancedImageRecordB.id,
          version: enhancedImageRecordB.version,
        });
        console.log('✅ Opción B saved to database:', enhancedImageRecordB.id);
      }

      return NextResponse.json({
        options: savedImages,
        originalS3Url: originalS3Info?.location || null,
        projectId: finalProjectId,
        siteVisitId: siteVisitId || null,
        errors: {
          optionA: optionAError,
          optionB: optionBError,
        },
      });
    } catch (dbError) {
      console.error('Error saving to database:', dbError);
      // Still return results even if DB save fails
      return NextResponse.json({
        options: [
          optionA ? { option: 'A', url: optionA.url } : null,
          optionB ? { option: 'B', url: optionB.url } : null,
        ].filter(Boolean),
        originalS3Url: originalS3Info?.location || null,
        projectId: finalProjectId || projectId || null,
        siteVisitId: siteVisitId || null,
        errors: {
          optionA: optionAError,
          optionB: optionBError,
          database: 'Database save failed, but images are available',
        },
      });
    }
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error.message || 'Enhancement failed' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
export const runtime = 'nodejs';
