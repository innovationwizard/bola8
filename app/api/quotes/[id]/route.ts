import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getQuotationVersion } from '@/lib/quotation-engine';

/**
 * GET /api/quotes/[id]
 * Get quotation with current version
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const quoteResult = await query(
      `SELECT q.*, qv.id as current_version_id, qv.version_number, qv.is_final
       FROM quotes q
       LEFT JOIN quote_versions qv ON q.current_version_id = qv.id
       WHERE q.id = $1`,
      [id]
    );

    if (quoteResult.rows.length === 0) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
    }

    const quote = quoteResult.rows[0];
    let currentVersion = null;

    if (quote.current_version_id) {
      currentVersion = await getQuotationVersion(quote.current_version_id);
    }

    return NextResponse.json({
      quotation: quote,
      current_version: currentVersion,
    });
  } catch (error: unknown) {
    console.error('Error fetching quotation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quotation', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/quotes/[id]
 * Update quotation settings (IVA rate, margin rate, etc.)
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { iva_rate, margin_rate, status, notes } = body;

    const result = await query(
      `UPDATE quotes SET
        iva_rate = COALESCE($1, iva_rate),
        margin_rate = COALESCE($2, margin_rate),
        status = COALESCE($3, status),
        notes = COALESCE($4, notes),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [iva_rate || null, margin_rate || null, status || null, notes || null, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
    }

    return NextResponse.json({ quotation: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error updating quotation:', error);
    return NextResponse.json(
      { error: 'Failed to update quotation', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

