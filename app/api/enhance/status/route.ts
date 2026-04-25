import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { STORAGE_BUCKETS, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';
import { saveImageToDatabase } from '@/lib/db/image-storage';

const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
const BASE_URL = 'https://cloud.leonardo.ai/api/rest/v1';

async function pollLeonardo(generationId: string) {
  const response = await fetch(`${BASE_URL}/generations/${generationId}`, {
    headers: { authorization: `Bearer ${LEONARDO_API_KEY}` },
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.generations_by_pk;
}

async function pollReplicate(predictionId: string) {
  const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
    headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` },
  });
  if (!response.ok) return null;
  return response.json();
}

// GET /api/enhance/status?jobId=xxx
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

    const jobResult = await query('SELECT * FROM enhancement_jobs WHERE id = $1', [jobId]);
    if (jobResult.rows.length === 0) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const job = jobResult.rows[0];

    // Already terminal
    if (job.status === 'complete' || job.status === 'failed') {
      return NextResponse.json({
        status: job.status,
        options: job.result_options || [],
        errors: job.errors || {},
        projectId: job.project_id,
      });
    }

    // Still in flight — check both providers
    const options: Array<{ option: string; url: string }> = [];
    const errors: Record<string, string | null> = job.errors || {};

    // Check Leonardo
    if (job.leonardo_generation_id && !errors.optionA) {
      const gen = await pollLeonardo(job.leonardo_generation_id);
      if (gen?.status === 'COMPLETE') {
        const leonardoUrl = gen.generated_images[0].url;
        // Download and store in Supabase
        try {
          const res = await fetch(leonardoUrl);
          const buf = Buffer.from(await res.arrayBuffer());
          const safeName = (job.filename || 'enhanced.jpg').replace(/[^a-zA-Z0-9._-]/g, '-');
          const storagePath = `enhanced/${job.project_id || 'unknown'}/${Date.now()}-option-a-${safeName}`;
          await uploadBuffer(STORAGE_BUCKETS.COMPOSITIONS, storagePath, buf, 'image/jpeg');
          const publicUrl = getPublicUrl(STORAGE_BUCKETS.COMPOSITIONS, storagePath);

          await saveImageToDatabase({
            projectId: job.project_id,
            siteVisitId: job.site_visit_id,
            workflowStep: 'design',
            imageType: 'enhanced',
            enhancedUrl: publicUrl,
            s3Key: storagePath,
            s3Bucket: STORAGE_BUCKETS.COMPOSITIONS,
            filename: `option-a-${job.filename}`,
            mimeType: job.mime_type,
            metadata: { enhancement_type: 'general', option: 'A', provider: 'leonardo', mode: job.mode },
          });

          options.push({ option: 'A', url: publicUrl });
        } catch (err: unknown) {
          errors.optionA = err instanceof Error ? err.message : 'Store failed';
        }
      } else if (gen?.status === 'FAILED') {
        errors.optionA = 'Leonardo generation failed';
      }
    }

    // Check Replicate
    if (job.replicate_prediction_id && !errors.optionB) {
      const pred = await pollReplicate(job.replicate_prediction_id);
      if (pred?.status === 'succeeded' && pred.output?.length > 0) {
        const replicateUrl = pred.output[0];
        try {
          const res = await fetch(replicateUrl);
          const buf = Buffer.from(await res.arrayBuffer());
          const safeName = (job.filename || 'enhanced.jpg').replace(/[^a-zA-Z0-9._-]/g, '-');
          const storagePath = `enhanced/${job.project_id || 'unknown'}/${Date.now()}-option-b-${safeName}`;
          await uploadBuffer(STORAGE_BUCKETS.COMPOSITIONS, storagePath, buf, 'image/jpeg');
          const publicUrl = getPublicUrl(STORAGE_BUCKETS.COMPOSITIONS, storagePath);

          await saveImageToDatabase({
            projectId: job.project_id,
            siteVisitId: job.site_visit_id,
            workflowStep: 'design',
            imageType: 'enhanced',
            enhancedUrl: publicUrl,
            s3Key: storagePath,
            s3Bucket: STORAGE_BUCKETS.COMPOSITIONS,
            filename: `option-b-${job.filename}`,
            mimeType: job.mime_type,
            metadata: { enhancement_type: 'general', option: 'B', provider: 'stablediffusion', mode: job.mode },
          });

          options.push({ option: 'B', url: publicUrl });
        } catch (err: unknown) {
          errors.optionB = err instanceof Error ? err.message : 'Store failed';
        }
      } else if (pred?.status === 'failed') {
        errors.optionB = pred.error || 'Replicate failed';
      }
    }

    // Determine new status
    const leonardoDone = !!options.find((o) => o.option === 'A') || !!errors.optionA;
    const replicateDone = !!options.find((o) => o.option === 'B') || !!errors.optionB;
    const bothDone =
      leonardoDone && (job.replicate_prediction_id ? replicateDone : true) &&
      (!job.leonardo_generation_id || leonardoDone);

    // Merge with previously stored options
    const prevOptions: Array<{ option: string; url: string }> = job.result_options || [];
    const allOptions = [...prevOptions, ...options].filter(
      (o, i, arr) => arr.findIndex((x) => x.option === o.option) === i
    );

    const newStatus = allOptions.length > 0 && (bothDone || allOptions.length >= 2)
      ? 'complete'
      : bothDone && allOptions.length === 0
      ? 'failed'
      : 'processing';

    await query(
      `UPDATE enhancement_jobs
       SET status = $1, result_options = $2, errors = $3, updated_at = NOW()
       WHERE id = $4`,
      [newStatus, JSON.stringify(allOptions), JSON.stringify(errors), jobId]
    );

    return NextResponse.json({
      status: newStatus,
      options: allOptions,
      errors,
      projectId: job.project_id,
    });
  } catch (error: unknown) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Status check failed' },
      { status: 500 }
    );
  }
}

export const maxDuration = 10;
export const runtime = 'nodejs';
