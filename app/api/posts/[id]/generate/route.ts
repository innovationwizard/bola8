import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import {
  createImageWithGoogle,
  applyStyleReferences,
  generateFromRender,
  MAX_STYLE_REFS,
  IMAGE_WIDTH,
  IMAGE_HEIGHT,
} from '@/lib/google-image';
import { STORAGE_BUCKETS, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';
import { buildBrandPromptSection, type BrandDNA, type ProjectBrandGuidelines } from '@/lib/brand';

const FORMATO_NOTES: Record<string, string> = {
  'Reel':     'Vertical video-cover format. Bold single visual, strong focal point, minimal scene complexity.',
  'Carrusel': 'First slide of a carousel. Composition must work as standalone and invite swiping right.',
  'Story':    'Ephemeral story format. Full-bleed vertical, bold visual impact, immediate read.',
  'Post':     'Standard portrait feed post. Balanced composition with breathing room.',
};

function buildPrompt(
  post: { idea: string | null; descripcion: string | null; texto_en_arte: string | null; formato: string | null },
  brand: BrandDNA | null,
  projectBrand: ProjectBrandGuidelines | null,
): string {
  const parts: string[] = [
    `Ultra-realistic photorealistic marketing image. ${IMAGE_WIDTH}x${IMAGE_HEIGHT}px portrait 4:5. 8k, sharp focus, professional studio lighting, clean composition, brand-ready commercial photography.`,
  ];

  const brandSection = buildBrandPromptSection(brand, projectBrand);
  if (brandSection) parts.push(brandSection);

  if (post.formato && FORMATO_NOTES[post.formato])
    parts.push(`Format: ${FORMATO_NOTES[post.formato]}`);

  if (post.idea)          parts.push(`Concept: ${post.idea}.`);
  if (post.descripcion)   parts.push(`Brief: ${post.descripcion}.`);
  if (post.texto_en_arte) parts.push(`The image will carry this display text — design the visual to complement it (do not render the text itself): "${post.texto_en_arte}".`);

  return parts.join(' ');
}

async function downloadBuffer(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.UPLOADS)
    .download(storagePath);
  if (error) throw new Error(`Storage download failed: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch post + project brand context in one query.
    const postRes = await query(
      `SELECT p.id, p.project_id, p.idea, p.descripcion, p.texto_en_arte, p.formato,
              pr.brand_guidelines,
              c.brand_dna
         FROM posts p
         JOIN projects pr ON pr.id = p.project_id
         LEFT JOIN clients c ON c.id = pr.client_id
        WHERE p.id = $1`,
      [id]
    );
    if (!postRes.rows.length)
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    const row          = postRes.rows[0];
    const brand        = (row.brand_dna        ?? null) as BrandDNA | null;
    const projectBrand = (row.brand_guidelines ?? null) as ProjectBrandGuidelines | null;
    const prompt       = buildPrompt(row, brand, projectBrand);

    console.log('[generate] post:', id, '| prompt:', prompt);

    // ── Fetch all image inputs in parallel ────────────────────────────────────

    const [pinnedRenderRes, pinterestRes, styleRefRes] = await Promise.all([
      // Pinned project render — structural anchor for the building.
      query(
        `SELECT storage_path FROM project_reference_images
          WHERE project_id = $1 AND role = 'render' AND is_pinned = TRUE
          LIMIT 1`,
        [row.project_id]
      ),
      // Post-level Pinterest Inspo — highest-priority style direction (max 3).
      query(
        `SELECT storage_path FROM post_reference_images
          WHERE post_id = $1
          ORDER BY display_order ASC, created_at ASC
          LIMIT $2`,
        [id, MAX_STYLE_REFS]
      ),
      // Project-level style references — supporting brand context.
      query(
        `SELECT storage_path FROM project_reference_images
          WHERE project_id = $1 AND role = 'style'
          ORDER BY display_order ASC, created_at ASC
          LIMIT $2`,
        [row.project_id, MAX_STYLE_REFS]
      ),
    ]);

    const pinnedRender = pinnedRenderRes.rows[0] ?? null;

    let imageBuffer: Buffer;

    if (pinnedRender) {
      // ── Render-anchored path ─────────────────────────────────────────────
      // The pinned render is the structural base. Pinterest Inspo leads style.
      console.log('[generate] render-anchored path — pinned render:', pinnedRender.storage_path);

      const [renderBuffer, pinterestBuffers, styleBuffers] = await Promise.all([
        downloadBuffer(pinnedRender.storage_path),
        Promise.all(pinterestRes.rows.map((r: { storage_path: string }) => downloadBuffer(r.storage_path))),
        Promise.all(styleRefRes.rows.map((r: { storage_path: string }) => downloadBuffer(r.storage_path))),
      ]);

      console.log('[generate] pinterest inspo:', pinterestBuffers.length, '| style refs:', styleBuffers.length);

      imageBuffer = await generateFromRender(
        renderBuffer,
        prompt,
        [...pinterestBuffers, ...styleBuffers],
        pinterestBuffers.length,
        { route: '/api/posts/[id]/generate', postId: id, projectId: row.project_id },
      );
    } else {
      // ── Fallback: Imagen text-to-image path ──────────────────────────────
      // No pinned render — generate from text, then apply style refs.
      console.log('[generate] fallback path — no pinned render');

      imageBuffer = await createImageWithGoogle(prompt, undefined, {
        route: '/api/posts/[id]/generate', postId: id, projectId: row.project_id,
      });

      const allStyleRows = [...pinterestRes.rows, ...styleRefRes.rows].slice(0, MAX_STYLE_REFS);
      if (allStyleRows.length > 0) {
        const styleBuffers = await Promise.all(
          allStyleRows.map((r: { storage_path: string }) => downloadBuffer(r.storage_path))
        );
        console.log('[generate] applying', styleBuffers.length, 'style reference(s)');
        imageBuffer = await applyStyleReferences(imageBuffer, styleBuffers, {
          route: '/api/posts/[id]/generate', postId: id, projectId: row.project_id,
        });
      }
    }

    // ── Store result ─────────────────────────────────────────────────────────

    const storagePath = `enhanced/${row.project_id}/${Date.now()}-post-${id}.jpg`;
    await uploadBuffer(STORAGE_BUCKETS.COMPOSITIONS, storagePath, imageBuffer, 'image/jpeg');
    const publicUrl = getPublicUrl(STORAGE_BUCKETS.COMPOSITIONS, storagePath);

    const imgRes = await query(
      `INSERT INTO images
         (project_id, image_type, enhanced_url, s3_key, s3_bucket, filename, mime_type, metadata)
       VALUES ($1, 'enhanced', $2, $3, $4, $5, 'image/jpeg', $6)
       RETURNING id`,
      [
        row.project_id,
        publicUrl,
        storagePath,
        STORAGE_BUCKETS.COMPOSITIONS,
        `post-${id}.jpg`,
        JSON.stringify({
          enhancement_type: 'general',
          provider: 'google',
          post_id: id,
          render_anchored: !!pinnedRender,
        }),
      ]
    );
    const imageId = imgRes.rows[0].id;

    await query(
      `UPDATE posts SET image_id = $1, estatus = 'Generado', updated_at = NOW() WHERE id = $2`,
      [imageId, id]
    );

    return NextResponse.json({ imageId, url: publicUrl });
  } catch (err) {
    console.error('[generate] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
