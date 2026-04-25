import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { STORAGE_BUCKETS, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';
import { saveImageToDatabase, findOrCreateOriginalImage } from '@/lib/db/image-storage';
import { loadCurrentPromptVersion } from '@/lib/prompt-loader';
import { suggestParameters, type ParameterSuggestion } from '@/lib/ml-client';
import { ensurePromptVersionInDB, saveParameterExperiment } from '@/lib/db/training';
import Replicate from 'replicate';

const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const BASE_URL = 'https://cloud.leonardo.ai/api/rest/v1';

const replicate = REPLICATE_API_TOKEN ? new Replicate({ auth: REPLICATE_API_TOKEN }) : null;

const LEGACY_STRUCTURE_MODEL_ID = 'ac614f96-1082-45bf-be9d-757f2d31c174';
const CONTROLNET_CANNY_ID = '20660B5C-3A83-406A-B233-6AAD728A3267';

/**
 * Training endpoint - generates 2 variants with ML-optimized parameters
 */
export async function POST(request: Request) {
  try {
    console.log('=== Training enhancement request ===');

    if (!LEONARDO_API_KEY) {
      return NextResponse.json({ error: 'API key missing' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('image');
    const modeValue = (formData.get('mode') || 'structure').toString();
    const mode = modeValue === 'surfaces' ? 'surfaces' : 'structure';
    const projectId = formData.get('project_id');
    const siteVisitId = formData.get('site_visit_id');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No image' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Get original image dimensions
    const imageMetadata = await sharp(buffer).metadata();
    const originalWidth = imageMetadata.width!;
    const originalHeight = imageMetadata.height!;

    console.log(`Original image dimensions: ${originalWidth}x${originalHeight}`);

    // Save original to S3
    let originalS3Info = null;
    try {
      originalS3Info = await backupUploadToS3(buffer, file.name, file.type, projectId?.toString() || null);
      if (originalS3Info) {
        console.log('Archived original upload to S3:', originalS3Info.location);
      }
    } catch (archiveError) {
      console.error('Failed to archive original upload:', archiveError);
    }

    // Get final projectId
    const originalImageData = await findOrCreateOriginalImage(
      projectId?.toString() || null,
      originalS3Info,
      file.name,
      file.type,
      originalWidth,
      originalHeight
    );
    const finalProjectId = originalImageData.projectId;

    // Load current prompt version
    const promptVersion = await loadCurrentPromptVersion();
    console.log(`Using prompt version: ${promptVersion.version}`);

    // Get ML-suggested parameters (2 suggestions)
    const suggestions = await suggestParameters({
      mode,
      num_suggestions: 2,
    });

    console.log('ML suggested parameters:', suggestions);

    // Generate experiment ID
    const experimentId = `exp_${Date.now()}`;

    // Process both variants in parallel
    const enhancementPromises = suggestions.map(async (suggestion, index) => {
      const option = String.fromCharCode(65 + index); // 'A', 'B', etc.

      try {
        if (suggestion.api === 'leonardo') {
          return await generateWithLeonardo(
            buffer,
            promptVersion.leonardo as unknown as Record<string, unknown>,
            suggestion,
            finalProjectId,
            file.name,
            file.type,
            originalWidth,
            originalHeight,
            originalImageData.imageId,
            option,
            promptVersion.version
          );
        } else {
          return await generateWithStableDiffusion(
            buffer,
            promptVersion.stablediffusion as unknown as Record<string, unknown>,
            suggestion,
            finalProjectId,
            file.name,
            file.type,
            originalWidth,
            originalHeight,
            originalImageData.imageId,
            option,
            promptVersion.version
          );
        }
      } catch (error: unknown) {
        console.error(`Error generating option ${option}:`, error);
        return { option, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    const results = await Promise.allSettled(enhancementPromises);

    // Process results
    const options: Array<Record<string, unknown>> = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value && !('error' in result.value)) {
        options.push(result.value);
      }
    });

    if (options.length === 0) {
      return NextResponse.json(
        { error: 'All enhancements failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      experiment_id: experimentId,
      options,
      original_url: originalS3Info?.location || null,
      project_id: finalProjectId,
      site_visit_id: siteVisitId?.toString() || null,
    });
  } catch (error: unknown) {
    console.error('Training enhancement error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enhancement failed' },
      { status: 500 }
    );
  }
}

async function generateWithLeonardo(
  imageBuffer: Buffer,
  promptConfig: Record<string, unknown>,
  parameters: ParameterSuggestion,
  projectId: string,
  filename: string,
  mimeType: string,
  originalWidth: number,
  originalHeight: number,
  parentImageId: string | null,
  option: string,
  promptVersion: string
) {
  // Upload to Leonardo
  const uploadResult = await uploadToLeonardo(imageBuffer);
  const { imageId, width, height } = uploadResult;

  // Build generation payload with ML parameters
  const payload = {
    prompt: (promptConfig.prompt as string) || '',
    negative_prompt: (promptConfig.negative_prompt as string) || '',
    guidance_scale: parameters.guidance_scale,
    num_images: 1,
    scheduler: 'KLMS',
    init_image_id: imageId,
    width,
    height,
    init_strength: parameters.init_strength,
    alchemy: false,
    modelId: LEGACY_STRUCTURE_MODEL_ID,
    controlNet: {
      controlnetModelId: CONTROLNET_CANNY_ID,
      initImageId: imageId,
      weight: parameters.controlnet_weight,
      preprocessor: false,
    },
  };

  console.log(`[Option ${option}] Leonardo generation payload:`, payload);

  // Generate
  const generationId = await generateEnhancedImage(payload);
  const enhancedUrl = await pollForCompletion(generationId);

  const enhancedS3Info = await saveEnhancedImageToStorage(enhancedUrl, projectId, `option-${option.toLowerCase()}-${filename}`);

  // Save to DB
  const promptVersionId = await ensurePromptVersionInDB(
    promptVersion,
    (promptConfig.prompt as string) || '',
    (promptConfig.negative_prompt as string) || ''
  );

  const imageRecord = await saveImageToDatabase({
    projectId,
    siteVisitId: null,
    workflowStep: 'design',
    imageType: 'enhanced',
    enhancedUrl: enhancedS3Info?.location || enhancedUrl,
    leonardoImageId: imageId,
    s3Key: enhancedS3Info?.key || null,
    s3Bucket: enhancedS3Info?.bucket || null,
    filename: `option-${option.toLowerCase()}-${filename}`,
    mimeType,
    width,
    height,
    metadata: {
      enhancement_type: 'training',
      option,
      provider: 'leonardo',
      prompt_version: promptVersion,
      parameters,
    },
    parentImageId,
  });

  // Save parameter experiment
  await saveParameterExperiment({
    image_id: imageRecord.id as string,
    prompt_version_id: promptVersionId,
    init_strength: parameters.init_strength,
    guidance_scale: parameters.guidance_scale,
    controlnet_weight: parameters.controlnet_weight,
  });

  return {
    option,
    url: enhancedS3Info?.location || enhancedUrl,
    image_id: imageRecord.id as string,
    parameters: {
      ...parameters,
      api: 'leonardo', // Override to ensure correct API
    },
  };
}

async function generateWithStableDiffusion(
  imageBuffer: Buffer,
  promptConfig: Record<string, unknown>,
  parameters: ParameterSuggestion,
  projectId: string,
  filename: string,
  mimeType: string,
  originalWidth: number,
  originalHeight: number,
  parentImageId: string | null,
  option: string,
  promptVersion: string
) {
  if (!replicate) {
    throw new Error('Replicate not configured');
  }

  // Process image
  const { processedBuffer, targetWidth, targetHeight } = await processImageForSD(
    imageBuffer,
    originalWidth,
    originalHeight
  );

  // Convert to base64
  const base64Image = processedBuffer.toString('base64');
  const dataUri = `data:image/jpeg;base64,${base64Image}`;

  console.log(`[Option ${option}] SD generation with:`, parameters);

  // Generate with Stable Diffusion
  const output = await replicate.run(
    'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
    {
      input: {
        image: dataUri,
        prompt: (promptConfig.prompt as string) || '',
        negative_prompt: (promptConfig.negative_prompt as string) || '',
        num_outputs: 1,
        num_inference_steps: 50,
        guidance_scale: parameters.guidance_scale,
        strength: parameters.strength,
        width: targetWidth,
        height: targetHeight,
        controlnet_conditioning_scale: parameters.controlnet_conditioning_scale,
      },
    }
  );

  let enhancedUrl: string;
  if (Array.isArray(output) && output.length > 0) {
    enhancedUrl = output[0];
  } else if (typeof output === 'string') {
    enhancedUrl = output;
  } else {
    throw new Error('Unexpected output format from Replicate');
  }

  const sdResponse = await fetch(enhancedUrl);
  const sdBuffer = Buffer.from(await sdResponse.arrayBuffer());
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  const sdPath = `enhanced/${projectId}/${Date.now()}-option-${option.toLowerCase()}-${safeName}`;
  await uploadBuffer(STORAGE_BUCKETS.COMPOSITIONS, sdPath, sdBuffer, 'image/jpeg');
  const enhancedS3Info = {
    bucket: STORAGE_BUCKETS.COMPOSITIONS,
    key: sdPath,
    location: getPublicUrl(STORAGE_BUCKETS.COMPOSITIONS, sdPath),
  };

  // Save to DB
  const promptVersionId = await ensurePromptVersionInDB(
    promptVersion,
    (promptConfig.prompt as string) || '',
    (promptConfig.negative_prompt as string) || ''
  );

  const imageRecord = await saveImageToDatabase({
    projectId,
    siteVisitId: null,
    workflowStep: 'design',
    imageType: 'enhanced',
    enhancedUrl: enhancedS3Info.location,
    s3Key: enhancedS3Info.key,
    s3Bucket: enhancedS3Info.bucket,
    filename: `option-${option.toLowerCase()}-${filename}`,
    mimeType,
    width: targetWidth,
    height: targetHeight,
    metadata: {
      enhancement_type: 'training',
      option,
      provider: 'stablediffusion',
      prompt_version: promptVersion,
      parameters,
    },
    parentImageId,
  });

  // Save parameter experiment
  await saveParameterExperiment({
    image_id: imageRecord.id as string,
    prompt_version_id: promptVersionId,
    init_strength: parameters.strength,
    guidance_scale: parameters.guidance_scale,
  });

  return {
    option,
    url: enhancedS3Info.location,
    image_id: imageRecord.id as string,
    parameters: {
      ...parameters,
      api: 'stablediffusion', // Override to ensure correct API
    },
  };
}

// Helper functions (copied from route.js with modifications)

async function uploadToLeonardo(imageBuffer: Buffer) {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const originalWidth = metadata.width!;
  const originalHeight = metadata.height!;

  const aspectRatio = originalWidth / originalHeight;
  const minDimension = 1024;
  const maxDimension = 2048;

  let targetWidth, targetHeight;

  if (originalWidth < minDimension && originalHeight < minDimension) {
    if (originalWidth >= originalHeight) {
      targetWidth = minDimension;
      targetHeight = Math.round(minDimension / aspectRatio);
    } else {
      targetHeight = minDimension;
      targetWidth = Math.round(minDimension * aspectRatio);
    }
  } else if (originalWidth > maxDimension || originalHeight > maxDimension) {
    if (originalWidth > originalHeight) {
      targetWidth = maxDimension;
      targetHeight = Math.round(maxDimension / aspectRatio);
    } else {
      targetHeight = maxDimension;
      targetWidth = Math.round(maxDimension * aspectRatio);
    }
  } else {
    targetWidth = originalWidth;
    targetHeight = originalHeight;
  }

  targetWidth = Math.floor(targetWidth / 8) * 8;
  targetHeight = Math.floor(targetHeight / 8) * 8;

  if (targetWidth < 512) targetWidth = 512;
  if (targetHeight < 512) targetHeight = 512;

  targetWidth = Math.floor(targetWidth / 8) * 8;
  targetHeight = Math.floor(targetHeight / 8) * 8;

  const processedBuffer = await image
    .resize(targetWidth, targetHeight, {
      fit: 'fill',
      kernel: 'lanczos3',
    })
    .jpeg({ quality: 95, mozjpeg: true })
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
    throw new Error(`Failed to init upload: ${initResponse.status}`);
  }

  const initData = await initResponse.json();
  const { url: uploadUrl, id: imageId, fields: fieldsString } = initData.uploadInitImage;

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
    throw new Error(`S3 Upload failed: ${uploadResponse.status}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));

  return { imageId, width: finalWidth, height: finalHeight };
}

async function generateEnhancedImage(payload: Record<string, unknown>) {
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
    throw new Error(JSON.stringify(error));
  }

  const data = await response.json();
  return data.sdGenerationJob.generationId;
}

async function pollForCompletion(generationId: string) {
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

async function backupUploadToS3(buffer: Buffer, filename: string, mimeType: string, projectId: string | null) {
  const safeName = (filename || 'upload.jpg').replace(/[^a-zA-Z0-9._-]/g, '-');
  const storagePath = `${projectId ? `uploads/${projectId}/originals` : 'uploads/originals'}/${Date.now()}-${safeName}`;
  await uploadBuffer(STORAGE_BUCKETS.UPLOADS, storagePath, buffer, mimeType || 'image/jpeg');
  return { bucket: STORAGE_BUCKETS.UPLOADS, key: storagePath, location: getPublicUrl(STORAGE_BUCKETS.UPLOADS, storagePath) };
}

async function saveEnhancedImageToStorage(imageUrl: string, projectId: string, filename: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Failed to download enhanced image');
  const buffer = Buffer.from(await response.arrayBuffer());

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  const storagePath = `enhanced/${projectId}/${Date.now()}-${safeName}`;
  await uploadBuffer(STORAGE_BUCKETS.COMPOSITIONS, storagePath, buffer, 'image/jpeg');
  return { bucket: STORAGE_BUCKETS.COMPOSITIONS, key: storagePath, location: getPublicUrl(STORAGE_BUCKETS.COMPOSITIONS, storagePath) };
}

async function processImageForSD(imageBuffer: Buffer, originalWidth: number, originalHeight: number) {
  const image = sharp(imageBuffer);
  const aspectRatio = originalWidth / originalHeight;
  const minDimension = 1024;
  const maxDimension = 2048;

  let targetWidth, targetHeight;

  if (originalWidth < minDimension && originalHeight < minDimension) {
    if (originalWidth >= originalHeight) {
      targetWidth = minDimension;
      targetHeight = Math.round(minDimension / aspectRatio);
    } else {
      targetHeight = minDimension;
      targetWidth = Math.round(minDimension * aspectRatio);
    }
  } else if (originalWidth > maxDimension || originalHeight > maxDimension) {
    if (originalWidth > originalHeight) {
      targetWidth = maxDimension;
      targetHeight = Math.round(maxDimension / aspectRatio);
    } else {
      targetHeight = maxDimension;
      targetWidth = Math.round(maxDimension * aspectRatio);
    }
  } else {
    targetWidth = originalWidth;
    targetHeight = originalHeight;
  }

  targetWidth = Math.floor(targetWidth / 8) * 8;
  targetHeight = Math.floor(targetHeight / 8) * 8;

  if (targetWidth < 512) targetWidth = 512;
  if (targetHeight < 512) targetHeight = 512;
  targetWidth = Math.floor(targetWidth / 8) * 8;
  targetHeight = Math.floor(targetHeight / 8) * 8;

  let processedBuffer = imageBuffer;
  if (targetWidth !== originalWidth || targetHeight !== originalHeight) {
    processedBuffer = await image
      .resize(targetWidth, targetHeight, {
        fit: 'fill',
        kernel: 'lanczos3',
      })
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
  }

  return { processedBuffer, targetWidth, targetHeight };
}

export const maxDuration = 60;
export const runtime = 'nodejs';
