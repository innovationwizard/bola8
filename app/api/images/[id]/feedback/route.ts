import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { rating, liked_aspects, improvement_notes } = await request.json();

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'rating must be 1–5' }, { status: 400 });
    }

    await query(
      `UPDATE images
          SET rating            = $1,
              liked_aspects     = $2,
              improvement_notes = $3,
              updated_at        = NOW()
        WHERE id = $4`,
      [rating, liked_aspects || null, improvement_notes || null, id]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[feedback] error:', err);
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
  }
}
