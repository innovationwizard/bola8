import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import {
  createImageWithGoogle,
  applyStyleReferences,
  MAX_STYLE_REFS,
  IMAGE_WIDTH,
  IMAGE_HEIGHT,
} from '@/lib/google-image';
import { STORAGE_BUCKETS, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';
import { buildBrandPromptSection, type BrandDNA, type ProjectBrandGuidelines } from '@/lib/brand';

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

  if (post.idea)          parts.push(`Concept: ${post.idea}.`);
  if (post.descripcion)   parts.push(`Brief: ${post.descripcion}.`);
  if (post.texto_en_arte) parts.push(`The image will carry this display text — design the visual to complement it (do not render the text itself): &ldquo;${post.texto_en_arte}&rdquo;.`);

  return parts.join(' ');
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

    // Fetch up to MAX_STYLE_REFS reference images for this project.
    const refRes = await query(
      `SELECT storage_path FROM project_reference_images
        WHERE project_id = $1
        ORDER BY display_order ASC, created_at ASC
        LIMIT $2`,
      [row.project_id, MAX_STYLE_REFS]
    );

    let imageBuffer = await createImageWithGoogle(prompt);

    if (refRes.rows.length > 0) {
      const styleBuffers = await Promise.all(
        refRes.rows.map(async (r: { storage_path: string }) => {
          const { data, error } = await supabase.storage
            .from(STORAGE_BUCKETS.UPLOADS)
            .download(r.storage_path);
          if (error) throw new Error(`Reference image download failed: ${error.message}`);
          return Buffer.from(await data.arrayBuffer());
        })
      );
      console.log('[generate] applying', styleBuffers.length, 'style reference(s)');
      imageBuffer = await applyStyleReferences(imageBuffer, styleBuffers);
    }

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
        JSON.stringify({ enhancement_type: 'general', provider: 'google', post_id: id }),
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
