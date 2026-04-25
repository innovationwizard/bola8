import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/quotes/[id]/versions/[versionId]/items
 * Get all items for a quotation version
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await query(
      `SELECT qi.*, s.name as space_name, cu.symbol as unit_symbol
       FROM quote_items qi
       LEFT JOIN spaces s ON qi.space_id = s.id
       LEFT JOIN cost_units cu ON qi.unit_id = cu.id
       WHERE qi.quote_version_id = $1
       ORDER BY s.display_order, qi.display_order, qi.item_name`,
      [versionId]
    );

    return NextResponse.json({
      items: result.rows,
      count: result.rows.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching quotation items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch items', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/quotes/[id]/versions/[versionId]/items
 * Create a new quotation item
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      space_id,
      item_name,
      category,
      description,
      dimensions,
      materials,
      material_ids,
      quantity,
      unit_id,
      unit_cost,
      labor_cost,
      iva_rate,
      margin_rate,
      image_id,
      notes,
    } = body;

    if (!item_name || quantity === undefined || unit_cost === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: item_name, quantity, unit_cost' },
        { status: 400 }
      );
    }

    // Get version's quotation to get default IVA and margin rates
    const quoteResult = await query(
      `SELECT q.iva_rate, q.margin_rate
       FROM quotes q
       JOIN quote_versions qv ON q.id = qv.quote_id
       WHERE qv.id = $1`,
      [versionId]
    );

    const defaultIvaRate = quoteResult.rows.length > 0 
      ? parseFloat(quoteResult.rows[0].iva_rate || 0.19)
      : 0.19;
    const defaultMarginRate = quoteResult.rows.length > 0
      ? parseFloat(quoteResult.rows[0].margin_rate || 0.30)
      : 0.30;

    const result = await query(
      `INSERT INTO quote_items (
        quote_version_id, space_id, item_name, category, description,
        dimensions, materials, material_ids, quantity, unit_id,
        unit_cost, labor_cost, subtotal, iva_rate, price_with_iva,
        margin_rate, profit, image_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        versionId,
        space_id || null,
        item_name,
        category || null,
        description || null,
        dimensions ? JSON.stringify(dimensions) : null,
        materials ? JSON.stringify(materials) : null,
        material_ids || null,
        quantity,
        unit_id || null,
        unit_cost,
        labor_cost || 0,
        0, // Will be calculated by trigger
        iva_rate !== undefined ? iva_rate : defaultIvaRate,
        0, // Will be calculated by trigger
        margin_rate !== undefined ? margin_rate : defaultMarginRate,
        0, // Will be calculated by trigger
        image_id || null,
        notes || null,
      ]
    );

    return NextResponse.json({ item: result.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating quotation item:', error);
    return NextResponse.json(
      { error: 'Failed to create item', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

