import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { STORAGE_BUCKETS } from '@/lib/storage-utils';

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
