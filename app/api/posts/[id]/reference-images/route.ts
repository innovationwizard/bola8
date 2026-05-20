import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { STORAGE_BUCKETS, getPublicUrl } from '@/lib/storage-utils';

const MAX_INSPO_IMAGES = 3;

// GET /api/posts/[id]/reference-images
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await query(
      `SELECT id, storage_path, url, caption, display_order, created_at
         FROM post_reference_images
        WHERE post_id = $1
        ORDER BY display_order ASC, created_at ASC`,
      [id]
    );

    const referenceImages = await Promise.all(
      result.rows.map(async (row) => {
        if (!row.storage_path) return row;
        const { data } = await supabase.storage
          .from(STORAGE_BUCKETS.UPLOADS)
          .createSignedUrl(row.storage_path, 3600);
        return { ...row, url: data?.signedUrl ?? row.url };
      })
    );

    return NextResponse.json({ referenceImages });
  } catch (err) {
    console.error('[post/reference-images] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch reference images' }, { status: 500 });
  }
}

// POST /api/posts/[id]/reference-images
// Body: { storagePath: string; caption?: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { storagePath, caption } = await request.json();

    if (!storagePath)
      return NextResponse.json({ error: 'storagePath is required' }, { status: 400 });

    // Verify post exists and get its project_id.
    const postRes = await query(
      `SELECT id, project_id FROM posts WHERE id = $1`,
      [id]
    );
    if (!postRes.rows.length)
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    const { project_id } = postRes.rows[0];

    // Enforce hard cap of 3 images.
    const countRes = await query(
      `SELECT COUNT(*) AS total FROM post_reference_images WHERE post_id = $1`,
      [id]
    );
    if (parseInt(countRes.rows[0].total) >= MAX_INSPO_IMAGES) {
      return NextResponse.json(
        { error: `Máximo ${MAX_INSPO_IMAGES} imágenes de inspiración por post` },
        { status: 422 }
      );
    }

    const url = getPublicUrl(STORAGE_BUCKETS.UPLOADS, storagePath);

    const orderRes = await query(
      `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
         FROM post_reference_images WHERE post_id = $1`,
      [id]
    );
    const nextOrder = orderRes.rows[0].next_order as number;

    const result = await query(
      `INSERT INTO post_reference_images
         (post_id, project_id, storage_path, url, caption, display_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, storage_path, url, caption, display_order, created_at`,
      [id, project_id, storagePath, url, caption ?? null, nextOrder]
    );

    const row = result.rows[0];
    const { data: signedData } = await supabase.storage
      .from(STORAGE_BUCKETS.UPLOADS)
      .createSignedUrl(storagePath, 3600);
    const referenceImage = { ...row, url: signedData?.signedUrl ?? row.url };

    return NextResponse.json({ referenceImage }, { status: 201 });
  } catch (err) {
    console.error('[post/reference-images] POST error:', err);
    return NextResponse.json({ error: 'Failed to save reference image' }, { status: 500 });
  }
}
