import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// POST /api/quotes/save - Save a quote to the database
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      project_id,
      quote_type,
      quote_data,
      total_amount,
      currency = 'MXN',
      status = 'draft',
      notes,
    } = body;

    if (!project_id || !quote_type || !quote_data || !total_amount) {
      return NextResponse.json(
        { error: 'Missing required fields: project_id, quote_type, quote_data, total_amount' },
        { status: 400 }
      );
    }

    if (!['furniture', 'space'].includes(quote_type)) {
      return NextResponse.json(
        { error: 'Invalid quote_type. Must be "furniture" or "space"' },
        { status: 400 }
      );
    }

    // Get the latest version for this project
    const versionResult = await query(
      'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM quotes WHERE project_id = $1',
      [project_id]
    );
    const version = versionResult.rows[0].next_version;

    const sql = `
      INSERT INTO quotes (
        project_id, quote_type, quote_data, total_amount,
        currency, status, version, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await query(sql, [
      project_id,
      quote_type,
      JSON.stringify(quote_data),
      total_amount,
      currency,
      status,
      version,
      notes || null,
    ]);

    return NextResponse.json({ quote: result.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error saving quote:', error);
    return NextResponse.json(
      { error: 'Failed to save quote', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

