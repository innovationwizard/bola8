import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await query(
      `SELECT
         p.id, p.post_number, p.fecha, p.idea, p.descripcion,
         p.caption, p.texto_en_arte, p.formato, p.plataforma, p.estatus,
         p.image_id,
         i.enhanced_url  AS image_url,
         i.rating        AS image_rating
       FROM posts p
       LEFT JOIN images i ON i.id = p.image_id
       WHERE p.project_id = $1
       ORDER BY p.post_number ASC NULLS LAST, p.fecha ASC NULLS LAST`,
      [id]
    );

    return NextResponse.json({ posts: result.rows });
  } catch (err) {
    console.error('[posts] error:', err);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}
