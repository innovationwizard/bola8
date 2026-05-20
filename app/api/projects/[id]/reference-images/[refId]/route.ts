import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { STORAGE_BUCKETS } from '@/lib/storage-utils';

// PATCH /api/projects/[id]/reference-images/[refId]
// Body: { is_pinned: true }
// Pins this render as the structural base for all generation on the project.
// Automatically unpins any previously pinned render first.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; refId: string }> }
) {
  try {
    const { id, refId } = await params;
    const { is_pinned } = await request.json();

    if (is_pinned !== true && is_pinned !== false)
      return NextResponse.json({ error: 'is_pinned must be a boolean' }, { status: 400 });

    // Verify the target image belongs to this project and is a render.
    const check = await query(
      `SELECT id, role FROM project_reference_images WHERE id = $1 AND project_id = $2`,
      [refId, id]
    );
    if (!check.rows.length)
      return NextResponse.json({ error: 'Reference image not found' }, { status: 404 });
    if (check.rows[0].role !== 'render')
      return NextResponse.json({ error: 'Only renders can be pinned' }, { status: 422 });

    if (is_pinned) {
      // Unpin all other renders for this project first, then pin this one.
      // Two separate statements so the partial unique index constraint is never violated.
      await query(
        `UPDATE project_reference_images
            SET is_pinned = FALSE
          WHERE project_id = $1 AND role = 'render' AND id != $2`,
        [id, refId]
      );
    }

    const result = await query(
      `UPDATE project_reference_images
          SET is_pinned = $1
        WHERE id = $2 AND project_id = $3
        RETURNING id, role, is_pinned, storage_path, caption, display_order`,
      [is_pinned, refId, id]
    );

    return NextResponse.json({ referenceImage: result.rows[0] });
  } catch (err) {
    console.error('[reference-images] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update reference image' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/reference-images/[refId]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; refId: string }> }
) {
  try {
    const { id, refId } = await params;

    const result = await query(
      `DELETE FROM project_reference_images
        WHERE id = $1 AND project_id = $2
        RETURNING storage_path`,
      [refId, id]
    );

    if (!result.rows.length)
      return NextResponse.json({ error: 'Reference image not found' }, { status: 404 });

    const { storage_path } = result.rows[0];

    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKETS.UPLOADS)
      .remove([storage_path]);

    if (storageError) {
      // Log but do not fail — DB record is already gone.
      console.error('[reference-images] Storage delete error:', storageError.message);
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('[reference-images] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete reference image' }, { status: 500 });
  }
}
