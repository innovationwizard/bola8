import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const result = await query(
      `SELECT id, name, brand_dna, created_at, updated_at
         FROM clients
        ORDER BY name ASC`
    );
    return NextResponse.json({ clients: result.rows });
  } catch (err) {
    console.error('[clients] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}
