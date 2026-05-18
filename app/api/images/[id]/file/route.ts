import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { supabase } from '@/lib/supabase';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await query(
      `SELECT s3_key, s3_bucket, mime_type, filename FROM images WHERE id = $1`,
      [id]
    );
    if (!res.rows.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { s3_key, s3_bucket, mime_type, filename } = res.rows[0];
    if (!s3_key || !s3_bucket) {
      return NextResponse.json({ error: 'No storage path' }, { status: 404 });
    }

    const { data, error } = await supabase.storage.from(s3_bucket).download(s3_key);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const contentType = mime_type || 'image/jpeg';
    const safeFilename = (filename || `image-${id}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '-');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${safeFilename}"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.error('[images/file] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
