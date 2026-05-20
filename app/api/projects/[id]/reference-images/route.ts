import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { STORAGE_BUCKETS, getPublicUrl } from '@/lib/storage-utils';

// GET /api/projects/[id]/reference-images?role=render|style (optional filter)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role'); // 'render' | 'style' | null (all)

    const validRole = role === 'render' || role === 'style' ? role : null;
    const result = validRole
      ? await query(
          `SELECT id, storage_path, url, caption, display_order, role, is_pinned, created_at
             FROM project_reference_images
            WHERE project_id = $1 AND role = $2
            ORDER BY display_order ASC, created_at ASC`,
          [id, validRole]
        )
      : await query(
          `SELECT id, storage_path, url, caption, display_order, role, is_pinned, created_at
             FROM project_reference_images
            WHERE project_id = $1
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
    console.error('[reference-images] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch reference images' }, { status: 500 });
  }
}

// POST /api/projects/[id]/reference-images
// Body: { storagePath: string; caption?: string; role?: 'render' | 'style' }
// Called after the browser has PUT the file to the signed URL.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { storagePath, caption, role } = await request.json();

    if (!storagePath)
      return NextResponse.json({ error: 'storagePath is required' }, { status: 400 });

    const validRole: 'render' | 'style' =
      role === 'render' ? 'render' : 'style';

    // Verify the project exists.
    const proj = await query(`SELECT id FROM projects WHERE id = $1`, [id]);
    if (!proj.rows.length)
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const url = getPublicUrl(STORAGE_BUCKETS.UPLOADS, storagePath);

    // Append after existing images within the same role bucket.
    const orderRes = await query(
      `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
         FROM project_reference_images WHERE project_id = $1 AND role = $2`,
      [id, validRole]
    );
    const nextOrder = orderRes.rows[0].next_order as number;

    const result = await query(
      `INSERT INTO project_reference_images
         (project_id, storage_path, url, caption, display_order, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, storage_path, url, caption, display_order, role, is_pinned, created_at`,
      [id, storagePath, url, caption ?? null, nextOrder, validRole]
    );

    const row = result.rows[0];
    const { data: signedData } = await supabase.storage
      .from(STORAGE_BUCKETS.UPLOADS)
      .createSignedUrl(storagePath, 3600);
    const referenceImage = { ...row, url: signedData?.signedUrl ?? row.url };

    return NextResponse.json({ referenceImage }, { status: 201 });
  } catch (err) {
    console.error('[reference-images] POST error:', err);
    return NextResponse.json({ error: 'Failed to save reference image' }, { status: 500 });
  }
}
