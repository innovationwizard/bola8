import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { STORAGE_BUCKETS, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';
import { findOrCreateOriginalImage, saveImageToDatabase } from '@/lib/db/image-storage';
import { query } from '@/lib/db';
// Creation flow → imagen-4-ultra (photorealistic render generation)
import { createImageWithGoogle } from '@/lib/google-image';

// ── Google Cloud (primary) ────────────────────────────────────────────────────
const GOOGLE_CLOUD_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

// ── Leonardo AI (commented out — do not delete) ───────────────────────────────
// const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
// const BASE_URL = 'https://cloud.leonardo.ai/api/rest/v1';
// const CONTROLNET_CANNY_ID = '20660B5C-3A83-406A-B233-6AAD728A3267';
// const LEGACY_STRUCTURE_MODEL_ID = 'ac614f96-1082-45bf-be9d-757f2d31c174';

// ── Replicate (commented out — do not delete) ─────────────────────────────────
// import Replicate from 'replicate';
// const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
// const replicate = REPLICATE_API_TOKEN ? new Replicate({ auth: REPLICATE_API_TOKEN }) : null;

const PROMPT =
  'ultra-realistic, photorealistic marketing image, 8k, sharp focus, professional studio lighting, clean composition, brand-ready quality, preserve exact subject, preserve exact colors, preserve exact layout, commercial photography standard';

// const NEGATIVE_PROMPT =
//   'drawn, sketch, illustration, cartoon, blurry, distorted, warped, ugly, noisy, grainy, unreal, material changes, color changes, element modifications, flat, montage, photoshop composition';

// ============================================================================
// HELPERS
// ============================================================================

// function buildGenerationPayload(imageId, width, height, mode) {
//   const isStructure = mode === 'structure';
//   const payload = {
//     prompt: PROMPT,
//     negative_prompt: NEGATIVE_PROMPT,
//     guidance_scale: 7,
//     num_images: 1,
//     scheduler: 'KLMS',
//     init_image_id: imageId,
//     width,
//     height,
//     init_strength: isStructure ? 0.25 : 0.3,
//     alchemy: !isStructure,
//   };
//   if (isStructure) {
//     payload.modelId = LEGACY_STRUCTURE_MODEL_ID;
//     payload.controlNet = {
//       controlnetModelId: CONTROLNET_CANNY_ID,
//       initImageId: imageId,
//       weight: 0.92,
//       preprocessor: false,
//     };
//   } else {
//     payload.photoReal = true;
//   }
//   return payload;
// }

async function preprocessImage(imageBuffer, minDim = 1024, maxDim = 2048) {
  const image = sharp(imageBuffer);
  const { width: origW, height: origH } = await image.metadata();
  const ratio = origW / origH;

  let tw, th;
  if (origW < minDim && origH < minDim) {
    if (origW >= origH) { tw = minDim; th = Math.round(minDim / ratio); }
    else { th = minDim; tw = Math.round(minDim * ratio); }
  } else if (origW > maxDim || origH > maxDim) {
    if (origW > origH) { tw = maxDim; th = Math.round(maxDim / ratio); }
    else { th = maxDim; tw = Math.round(maxDim * ratio); }
  } else {
    tw = origW; th = origH;
  }
  tw = Math.max(512, Math.floor(tw / 8) * 8);
  th = Math.max(512, Math.floor(th / 8) * 8);

  const buf = await image
    .resize(tw, th, { fit: 'fill', kernel: 'lanczos3' })
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  const { width: fw, height: fh } = await sharp(buf).metadata();
  return {
    buffer: buf,
    width: Math.floor(fw / 8) * 8,
    height: Math.floor(fh / 8) * 8,
  };
}

// ── Leonardo helpers (commented out — do not delete) ─────────────────────────
// async function uploadToLeonardo(imageBuffer) {
//   const { buffer: processedBuffer, width, height } = await preprocessImage(imageBuffer);
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
//   for (const [k, v] of Object.entries(fieldsObject)) formData.append(k, v);
//   formData.append('file', new Blob([processedBuffer], { type: 'image/jpeg' }), 'upload.jpg');
//   const uploadResponse = await fetch(uploadUrl, { method: 'POST', body: formData });
//   if (!uploadResponse.ok && uploadResponse.status !== 204) throw new Error(`S3 presigned upload failed: ${uploadResponse.status}`);
//   await new Promise((r) => setTimeout(r, 3000));
//   return { imageId, width, height };
// }

// async function startLeonardoGeneration(imageId, width, height, mode) {
//   const payload = buildGenerationPayload(imageId, width, height, mode);
//   const response = await fetch(`${BASE_URL}/generations`, {
//     method: 'POST',
//     headers: { authorization: `Bearer ${LEONARDO_API_KEY}`, 'content-type': 'application/json' },
//     body: JSON.stringify(payload),
//   });
//   if (!response.ok) throw new Error(JSON.stringify(await response.json()));
//   const data = await response.json();
//   return data.sdGenerationJob.generationId;
// }

// ── Replicate helper (commented out — do not delete) ─────────────────────────
// async function startReplicatePrediction(imageBuffer) {
//   if (!replicate) throw new Error('Replicate not configured');
//   const { buffer: processed, width, height } = await preprocessImage(imageBuffer);
//   const base64Image = `data:image/jpeg;base64,${processed.toString('base64')}`;
//   const prediction = await replicate.predictions.create({
//     version: '39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
//     input: {
//       image: base64Image,
//       prompt: 'ultra-realistic, photorealistic interior design render, 8k, sharp focus, realistic textures, professional photography quality, preserve exact layout, preserve exact elements',
//       negative_prompt: 'drawn, sketch, illustration, cartoon, blurry, distorted, warped, ugly, noisy, grainy, unreal',
//       num_outputs: 1,
//       num_inference_steps: 50,
//       guidance_scale: 7.5,
//       strength: 0.2,
//       width,
//       height,
//       controlnet_conditioning_scale: 0.95,
//     },
//   });
//   return prediction.id;
// }

// ============================================================================
// POST /api/enhance  — starts Google AI job, returns jobId immediately
// ============================================================================

export async function POST(request) {
  try {
    if (!GOOGLE_CLOUD_API_KEY) {
      return NextResponse.json({ error: 'GOOGLE_CLOUD_API_KEY not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('image');
    const mode = (formData.get('mode') || 'surfaces').toString() === 'surfaces' ? 'surfaces' : 'structure';
    const projectId = formData.get('project_id') || null;
    const siteVisitId = formData.get('site_visit_id') || null;

    if (!file) return NextResponse.json({ error: 'No image' }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const { width: origW, height: origH } = await sharp(buffer).metadata();

    // Archive original to Supabase Storage
    let originalUrl = null;
    let originalStoragePath = null;
    try {
      const safeName = (file.name || 'upload.jpg').replace(/[^a-zA-Z0-9._-]/g, '-');
      const prefix = projectId ? `uploads/${projectId}/originals` : 'uploads/originals';
      originalStoragePath = `${prefix}/${Date.now()}-${safeName}`;
      await uploadBuffer(STORAGE_BUCKETS.UPLOADS, originalStoragePath, buffer, file.type || 'image/jpeg');
      originalUrl = getPublicUrl(STORAGE_BUCKETS.UPLOADS, originalStoragePath);
    } catch (err) {
      console.error('Failed to archive original:', err);
    }

    // Ensure project record and original image DB record
    const originalImageData = await findOrCreateOriginalImage(
      projectId,
      originalUrl ? { bucket: STORAGE_BUCKETS.UPLOADS, key: originalStoragePath, location: originalUrl } : null,
      file.name,
      file.type,
      origW,
      origH
    );
    const finalProjectId = originalImageData.projectId;

    // Insert job row
    const jobResult = await query(
      `INSERT INTO enhancement_jobs (status, project_id, site_visit_id, filename, mime_type, mode, original_storage_path, original_url)
       VALUES ('pending', $1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [finalProjectId, siteVisitId, file.name, file.type, mode, originalStoragePath, originalUrl]
    );
    const jobId = jobResult.rows[0].id;

    // ── Google Cloud enhancement (fire and forget) ────────────────────────────
    (async () => {
      try {
        console.log('[Job] Starting Google AI enhancement, job:', jobId);
        const { buffer: processedBuffer } = await preprocessImage(buffer);
        // Creation flow: imagen-4-ultra generates photorealistic render
        const enhancedBuffer = await createImageWithGoogle(PROMPT, processedBuffer);

        const safeName = (file.name || 'enhanced.jpg').replace(/[^a-zA-Z0-9._-]/g, '-');
        const storagePath = `enhanced/${finalProjectId || 'unknown'}/${Date.now()}-${safeName}`;
        await uploadBuffer(STORAGE_BUCKETS.COMPOSITIONS, storagePath, enhancedBuffer, 'image/jpeg');
        const publicUrl = getPublicUrl(STORAGE_BUCKETS.COMPOSITIONS, storagePath);

        await saveImageToDatabase({
          projectId: finalProjectId,
          siteVisitId,
          workflowStep: 'design',
          imageType: 'enhanced',
          enhancedUrl: publicUrl,
          s3Key: storagePath,
          s3Bucket: STORAGE_BUCKETS.COMPOSITIONS,
          filename: file.name,
          mimeType: file.type,
          metadata: { enhancement_type: 'general', option: 'A', provider: 'google', mode },
          parentImageId: originalImageData.imageId,
        });

        const options = [{ option: 'A', url: publicUrl }];
        await query(
          `UPDATE enhancement_jobs SET status = 'complete', result_options = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(options), jobId]
        );
        console.log('[Job] Google AI enhancement complete, job:', jobId);
      } catch (err) {
        console.error('[Job] Google AI enhancement failed:', err);
        await query(
          `UPDATE enhancement_jobs SET status = 'failed', errors = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify({ optionA: err.message }), jobId]
        );
      }
    })();

    // ── Leonardo + Replicate (commented out — do not delete) ──────────────────
    // (async () => {
    //   let leonardoGenerationId = null;
    //   let replicatePredictionId = null;
    //   const errors = {};
    //   try {
    //     const { imageId, width, height } = await uploadToLeonardo(buffer);
    //     leonardoGenerationId = await startLeonardoGeneration(imageId, width, height, mode);
    //   } catch (err) {
    //     console.error('[Job] Leonardo start failed:', err);
    //     errors.optionA = err.message;
    //   }
    //   try {
    //     replicatePredictionId = await startReplicatePrediction(buffer);
    //   } catch (err) {
    //     console.error('[Job] Replicate start failed:', err);
    //     errors.optionB = err.message;
    //   }
    //   await query(
    //     `UPDATE enhancement_jobs SET status = 'processing', leonardo_generation_id = $1,
    //      replicate_prediction_id = $2, errors = $3, updated_at = NOW() WHERE id = $4`,
    //     [leonardoGenerationId, replicatePredictionId, JSON.stringify(errors), jobId]
    //   );
    // })();

    return NextResponse.json({ jobId, status: 'pending', projectId: finalProjectId });
  } catch (error) {
    console.error('Error starting enhancement job:', error);
    return NextResponse.json({ error: error.message || 'Enhancement failed' }, { status: 500 });
  }
}

export const maxDuration = 10;
export const runtime = 'nodejs';
