import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await query(
      `SELECT id, name, brand_dna, created_at, updated_at FROM clients WHERE id = $1`,
      [id]
    );
    if (!result.rows.length)
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    return NextResponse.json({ client: result.rows[0] });
  } catch (err) {
    console.error('[clients/id] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch client' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { brand_dna } = body;

    const result = await query(
      `UPDATE clients
          SET brand_dna  = $1,
              updated_at = NOW()
        WHERE id = $2
        RETURNING id, name, brand_dna, updated_at`,
      [JSON.stringify(brand_dna), id]
    );
    if (!result.rows.length)
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    return NextResponse.json({ client: result.rows[0] });
  } catch (err) {
    console.error('[clients/id] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
  }
}
