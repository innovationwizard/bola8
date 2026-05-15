import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await query(
      `SELECT p.brand_guidelines, c.id AS client_id, c.brand_dna
         FROM projects p
         LEFT JOIN clients c ON c.id = p.client_id
        WHERE p.id = $1`,
      [id]
    );
    if (!result.rows.length)
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error('[projects/brand] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch brand data' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { brand_guidelines } = await request.json();

    const result = await query(
      `UPDATE projects
          SET brand_guidelines = $1,
              updated_at       = NOW()
        WHERE id = $2
        RETURNING id, brand_guidelines`,
      [JSON.stringify(brand_guidelines), id]
    );
    if (!result.rows.length)
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json({ brand_guidelines: result.rows[0].brand_guidelines });
  } catch (err) {
    console.error('[projects/brand] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update brand guidelines' }, { status: 500 });
  }
}
