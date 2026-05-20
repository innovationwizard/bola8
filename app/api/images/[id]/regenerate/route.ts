import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import {
  composeImageWithGoogle,
  generateFromRender,
  MAX_STYLE_REFS,
  IMAGE_WIDTH,
  IMAGE_HEIGHT,
} from '@/lib/google-image';
import { STORAGE_BUCKETS, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';
import { saveImageToDatabase } from '@/lib/db/image-storage';
import { buildBrandPromptSection, type BrandDNA, type ProjectBrandGuidelines } from '@/lib/brand';

const FORMATO_NOTES: Record<string, string> = {
  'Reel':     'Vertical video-cover format. Bold single visual, strong focal point, minimal scene complexity.',
  'Carrusel': 'First slide of a carousel. Composition must work as standalone and invite swiping right.',
  'Story':    'Ephemeral story format. Full-bleed vertical, bold visual impact, immediate read.',
  'Post':     'Standard portrait feed post. Balanced composition with breathing room.',
};

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
    `SELECT rating, liked_aspects, improvement_notes, reference_image_id, created_at
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
    reference_image_id: string | null;
  }[];
}

function buildPrompt(
  feedback: Awaited<ReturnType<typeof collectFeedback>>,
  post: { idea: string | null; texto_en_arte: string | null; descripcion: string | null; formato: string | null } | null,
  brand: BrandDNA | null,
  projectBrand: ProjectBrandGuidelines | null,
): string {
  const parts: string[] = [
    `Ultra-realistic photorealistic marketing image. ${IMAGE_WIDTH}x${IMAGE_HEIGHT}px portrait 4:5. 8k, sharp focus, professional studio lighting, clean composition, brand-ready commercial photography.`,
  ];

  const brandSection = buildBrandPromptSection(brand, projectBrand);
  if (brandSection) parts.push(brandSection);

  if (post?.formato && FORMATO_NOTES[post.formato])
    parts.push(`Format: ${FORMATO_NOTES[post.formato]}`);

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

async function downloadBuffer(bucket: string, storagePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error) throw new Error(`Storage download failed: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function POST(
  _request: Request,
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

    // Fetch post (for instructions + format) and accumulated feedback.
    const postRes = await query(
      `SELECT idea, texto_en_arte, descripcion, formato
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

    // ── Fetch all image inputs in parallel ────────────────────────────────────

    // Collect feedback reference image IDs (from prior iterations).
    const feedbackRefIds = [...new Set(
      feedback.map(f => f.reference_image_id).filter((rid): rid is string => !!rid)
    )].slice(0, MAX_STYLE_REFS);

    // Post ID: look up from the post that owns this image chain.
    const postIdRes = await query(
      `SELECT id FROM posts WHERE image_id = ANY(
         SELECT id FROM images WHERE id = $1 OR parent_image_id = $1
       ) LIMIT 1`,
      [rootId]
    );
    const postId = postIdRes.rows[0]?.id ?? null;

    const [pinnedRenderRes, pinterestRes, projectStyleRes, feedbackRefRes] = await Promise.all([
      // Pinned render — structural anchor.
      query(
        `SELECT storage_path FROM project_reference_images
          WHERE project_id = $1 AND role = 'render' AND is_pinned = TRUE
          LIMIT 1`,
        [image.project_id]
      ),
      // Post Pinterest Inspo — highest-priority style.
      postId
        ? query(
            `SELECT storage_path FROM post_reference_images
              WHERE post_id = $1
              ORDER BY display_order ASC, created_at ASC
              LIMIT $2`,
            [postId, MAX_STYLE_REFS]
          )
        : Promise.resolve({ rows: [] }),
      // Project style refs — brand context.
      query(
        `SELECT storage_path FROM project_reference_images
          WHERE project_id = $1 AND role = 'style'
          ORDER BY display_order ASC, created_at ASC
          LIMIT $2`,
        [image.project_id, MAX_STYLE_REFS]
      ),
      // Feedback reference images from prior iterations.
      feedbackRefIds.length > 0
        ? query(
            `SELECT storage_path FROM project_reference_images
              WHERE id = ANY($1::uuid[])`,
            [feedbackRefIds]
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const pinnedRender = pinnedRenderRes.rows[0] ?? null;

    // Download the current image (always needed as composition base in fallback path).
    const currentImageBuffer = await downloadBuffer(image.s3_bucket, image.s3_key);

    let newBuffer: Buffer;

    if (pinnedRender) {
      // ── Render-anchored regeneration ─────────────────────────────────────
      console.log('[regenerate] render-anchored path');

      const [renderBuffer, pinterestBuffers, styleBuffers, feedbackBuffers] = await Promise.all([
        downloadBuffer(STORAGE_BUCKETS.UPLOADS, pinnedRender.storage_path),
        Promise.all(pinterestRes.rows.map((r: { storage_path: string }) =>
          downloadBuffer(STORAGE_BUCKETS.UPLOADS, r.storage_path))),
        Promise.all(projectStyleRes.rows.map((r: { storage_path: string }) =>
          downloadBuffer(STORAGE_BUCKETS.UPLOADS, r.storage_path))),
        Promise.all(feedbackRefRes.rows.map((r: { storage_path: string }) =>
          downloadBuffer(STORAGE_BUCKETS.UPLOADS, r.storage_path))),
      ]);

      // Style ref order: feedback refs first (most specific), then Pinterest Inspo, then project style.
      const allStyleRefs = [...feedbackBuffers, ...pinterestBuffers, ...styleBuffers];
      const pinterestCount = feedbackBuffers.length + pinterestBuffers.length;

      console.log('[regenerate] feedback refs:', feedbackBuffers.length,
        '| pinterest:', pinterestBuffers.length, '| style refs:', styleBuffers.length);

      newBuffer = await generateFromRender(
        renderBuffer,
        prompt,
        allStyleRefs,
        pinterestCount,
      );
    } else {
      // ── Fallback: compose from current image ─────────────────────────────
      console.log('[regenerate] fallback path — no pinned render');

      const [pinterestBuffers, styleBuffers, feedbackBuffers] = await Promise.all([
        Promise.all(pinterestRes.rows.map((r: { storage_path: string }) =>
          downloadBuffer(STORAGE_BUCKETS.UPLOADS, r.storage_path))),
        Promise.all(projectStyleRes.rows.map((r: { storage_path: string }) =>
          downloadBuffer(STORAGE_BUCKETS.UPLOADS, r.storage_path))),
        Promise.all(feedbackRefRes.rows.map((r: { storage_path: string }) =>
          downloadBuffer(STORAGE_BUCKETS.UPLOADS, r.storage_path))),
      ]);

      const allStyleRefs = [...feedbackBuffers, ...pinterestBuffers, ...styleBuffers]
        .slice(0, MAX_STYLE_REFS);

      console.log('[regenerate] style refs total:', allStyleRefs.length);
      newBuffer = await composeImageWithGoogle(currentImageBuffer, prompt,
        allStyleRefs.length > 0 ? allStyleRefs : undefined);
    }

    // ── Store result ─────────────────────────────────────────────────────────

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
      metadata:      {
        enhancement_type: 'general',
        provider: 'google',
        render_anchored: !!pinnedRender,
      },
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
