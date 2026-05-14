import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { createImageWithGoogle } from '@/lib/google-image';
import { STORAGE_BUCKETS, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';

function buildPrompt(post: {
  idea: string | null;
  descripcion: string | null;
  texto_en_arte: string | null;
  formato: string | null;
}): string {
  const parts: string[] = [
    'Ultra-realistic photorealistic marketing image. 8k, sharp focus, professional studio lighting, clean composition, brand-ready commercial photography.',
  ];

  if (post.idea)         parts.push(`Concept: ${post.idea}.`);
  if (post.descripcion)  parts.push(`Brief: ${post.descripcion}.`);
  if (post.texto_en_arte) parts.push(`The image will carry this display text — design the visual to complement it (do not render the text itself): "${post.texto_en_arte}".`);
  if (post.formato && post.formato !== 'Pendiente') {
    const aspect = post.formato.toLowerCase().includes('carrusel') ? 'square 1:1' : 'portrait 4:5';
    parts.push(`Format: ${aspect}.`);
  }

  return parts.join(' ');
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const postRes = await query(
      `SELECT id, project_id, idea, descripcion, texto_en_arte, formato
         FROM posts WHERE id = $1`,
      [id]
    );
    if (!postRes.rows.length) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    const post = postRes.rows[0];
    const prompt = buildPrompt(post);

    console.log('[generate] post:', id, '| prompt:', prompt);

    const imageBuffer = await createImageWithGoogle(prompt);

    const storagePath = `enhanced/${post.project_id}/${Date.now()}-post-${id}.jpg`;
    await uploadBuffer(STORAGE_BUCKETS.COMPOSITIONS, storagePath, imageBuffer, 'image/jpeg');
    const publicUrl = getPublicUrl(STORAGE_BUCKETS.COMPOSITIONS, storagePath);

    // Save the image record and link it to the post in one transaction.
    const imgRes = await query(
      `INSERT INTO images
         (project_id, image_type, enhanced_url, s3_key, s3_bucket,
          filename, mime_type, metadata)
       VALUES ($1, 'enhanced', $2, $3, $4, $5, 'image/jpeg', $6)
       RETURNING id`,
      [
        post.project_id,
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
