import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { composeImageWithGoogle } from '@/lib/google-image';
import { STORAGE_BUCKETS, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';
import { saveImageToDatabase } from '@/lib/db/image-storage';
import { buildBrandPromptSection, type BrandDNA, type ProjectBrandGuidelines } from '@/lib/brand';

async function findRootId(imageId: string): Promise<string> {
  let current = imageId;
  while (true) {
    const res = await query(`SELECT parent_image_id FROM images WHERE id = $1`, [current]);
    if (!res.rows.length || !res.rows[0].parent_image_id) return current;
    current = res.rows[0].parent_image_id;
  }
}

async function collectFeedback(rootId: string) {
  const res = await query(
    `SELECT rating, liked_aspects, improvement_notes, created_at
       FROM images
      WHERE (id = $1 OR parent_image_id = $1)
        AND (liked_aspects IS NOT NULL OR improvement_notes IS NOT NULL)
      ORDER BY created_at ASC`,
    [rootId]
  );
  return res.rows as {
    rating: number | null;
    liked_aspects: string | null;
    improvement_notes: string | null;
  }[];
}

function buildPrompt(
  feedback: Awaited<ReturnType<typeof collectFeedback>>,
  post: { idea: string | null; texto_en_arte: string | null; descripcion: string | null } | null,
  brand: BrandDNA | null,
  projectBrand: ProjectBrandGuidelines | null,
): string {
  const parts: string[] = [
    'Ultra-realistic photorealistic marketing image. 8k, sharp focus, professional studio lighting, clean composition, brand-ready commercial photography.',
  ];

  const brandSection = buildBrandPromptSection(brand, projectBrand);
  if (brandSection) parts.push(brandSection);

  if (post?.idea)          parts.push(`Concept: ${post.idea}.`);
  if (post?.descripcion)   parts.push(`Brief: ${post.descripcion}.`);
  if (post?.texto_en_arte) parts.push(`Display text (reference only, do not render as visible text): "${post.texto_en_arte}".`);

  if (feedback.length > 0) {
    const liked   = feedback.map(f => f.liked_aspects).filter(Boolean).join('; ');
    const improve = feedback.map(f => f.improvement_notes).filter(Boolean).join('; ');
    if (liked)   parts.push(`PRESERVE exactly — what worked: ${liked}.`);
    if (improve) parts.push(`IMPROVE — what needs work: ${improve}.`);
    parts.push('Refine the image to address every point of improvement while keeping everything that was already good.');
  }

  return parts.join(' ');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const imgRes = await query(
      `SELECT i.id, i.enhanced_url, i.original_url, i.s3_key, i.s3_bucket,
              i.project_id, i.filename, i.mime_type,
              pr.brand_guidelines,
              c.brand_dna
         FROM images i
         JOIN projects pr ON pr.id = i.project_id
         LEFT JOIN clients c ON c.id = pr.client_id
        WHERE i.id = $1`,
      [id]
    );
    if (!imgRes.rows.length)
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });

    const image = imgRes.rows[0];
    if (!image.s3_key || !image.s3_bucket)
      return NextResponse.json({ error: 'No storage path to regenerate from' }, { status: 400 });

    const brand        = (image.brand_dna        ?? null) as BrandDNA | null;
    const projectBrand = (image.brand_guidelines ?? null) as ProjectBrandGuidelines | null;
    const rootId       = await findRootId(id);

    const postRes = await query(
      `SELECT idea, texto_en_arte, descripcion
         FROM posts
        WHERE image_id = ANY(
          SELECT id FROM images WHERE id = $1 OR parent_image_id = $1
        )
        LIMIT 1`,
      [rootId]
    );
    const post = postRes.rows[0] ?? null;

    const feedback = await collectFeedback(rootId);
    const prompt   = buildPrompt(feedback, post, brand, projectBrand);

    console.log('[regenerate] prompt:', prompt);

    const { data: storageBlob, error: storageError } = await supabase.storage
      .from(image.s3_bucket)
      .download(image.s3_key);
    if (storageError) throw new Error(`Storage download failed: ${storageError.message}`);
    const imageBuffer = Buffer.from(await storageBlob.arrayBuffer());

    const newBuffer = await composeImageWithGoogle(imageBuffer, prompt);

    const safeName    = (image.filename || 'regen.jpg').replace(/[^a-zA-Z0-9._-]/g, '-');
    const storagePath = `enhanced/${image.project_id}/${Date.now()}-regen-${safeName}`;
    await uploadBuffer(STORAGE_BUCKETS.COMPOSITIONS, storagePath, newBuffer, 'image/jpeg');
    const publicUrl = getPublicUrl(STORAGE_BUCKETS.COMPOSITIONS, storagePath);

    const saved = await saveImageToDatabase({
      projectId:     image.project_id,
      workflowStep:  'design',
      imageType:     'enhanced',
      enhancedUrl:   publicUrl,
      s3Key:         storagePath,
      s3Bucket:      STORAGE_BUCKETS.COMPOSITIONS,
      filename:      image.filename,
      mimeType:      image.mime_type || 'image/jpeg',
      metadata:      { enhancement_type: 'general', provider: 'google' },
      parentImageId: rootId,
    });

    return NextResponse.json({ imageId: saved.imageId, url: publicUrl });
  } catch (err) {
    console.error('[regenerate] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Regeneration failed' },
      { status: 500 }
    );
  }
}
