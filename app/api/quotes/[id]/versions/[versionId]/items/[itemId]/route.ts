import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/quotes/[id]/versions/[versionId]/items/[itemId]
 * Get a single quotation item
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string; itemId: string }> }
) {
  try {
    const { versionId, itemId } = await params;
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
       WHERE qi.id = $1 AND qi.quote_version_id = $2`,
      [itemId, versionId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ item: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error fetching quotation item:', error);
    return NextResponse.json(
      { error: 'Failed to fetch item', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/quotes/[id]/versions/[versionId]/items/[itemId]
 * Update a quotation item
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string; itemId: string }> }
) {
  try {
    const { versionId, itemId } = await params;
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
      display_order,
    } = body;

    const result = await query(
      `UPDATE quote_items SET
        space_id = COALESCE($1, space_id),
        item_name = COALESCE($2, item_name),
        category = COALESCE($3, category),
        description = COALESCE($4, description),
        dimensions = COALESCE($5, dimensions),
        materials = COALESCE($6, materials),
        material_ids = COALESCE($7, material_ids),
        quantity = COALESCE($8, quantity),
        unit_id = COALESCE($9, unit_id),
        unit_cost = COALESCE($10, unit_cost),
        labor_cost = COALESCE($11, labor_cost),
        iva_rate = COALESCE($12, iva_rate),
        margin_rate = COALESCE($13, margin_rate),
        image_id = COALESCE($14, image_id),
        notes = COALESCE($15, notes),
        display_order = COALESCE($16, display_order),
        updated_by = $17,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $18 AND quote_version_id = $19
       RETURNING *`,
      [
        space_id !== undefined ? space_id : null,
        item_name || null,
        category || null,
        description || null,
        dimensions ? JSON.stringify(dimensions) : null,
        materials ? JSON.stringify(materials) : null,
        material_ids || null,
        quantity !== undefined ? quantity : null,
        unit_id || null,
        unit_cost !== undefined ? unit_cost : null,
        labor_cost !== undefined ? labor_cost : null,
        iva_rate !== undefined ? iva_rate : null,
        margin_rate !== undefined ? margin_rate : null,
        image_id || null,
        notes || null,
        display_order !== undefined ? display_order : null,
        user.id,
        itemId,
        versionId,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ item: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error updating quotation item:', error);
    return NextResponse.json(
      { error: 'Failed to update item', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/quotes/[id]/versions/[versionId]/items/[itemId]
 * Delete a quotation item
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string; itemId: string }> }
) {
  try {
    const { versionId, itemId } = await params;
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await query(
      'DELETE FROM quote_items WHERE id = $1 AND quote_version_id = $2 RETURNING *',
      [itemId, versionId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ item: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error deleting quotation item:', error);
    return NextResponse.json(
      { error: 'Failed to delete item', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

