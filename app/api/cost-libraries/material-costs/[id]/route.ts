import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/cost-libraries/material-costs/[id]
 * Get a single material cost
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

    const result = await query(
      `SELECT mc.*, m.name as material_name, m.name_es as material_name_es,
              cu.name as unit_name, cu.symbol as unit_symbol
       FROM material_costs mc
       LEFT JOIN materials m ON mc.material_id = m.id
       LEFT JOIN cost_units cu ON mc.unit_id = cu.id
       WHERE mc.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Material cost not found' }, { status: 404 });
    }

    return NextResponse.json({ cost: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error fetching material cost:', error);
    return NextResponse.json(
      { error: 'Failed to fetch material cost', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/cost-libraries/material-costs/[id]
 * Update a material cost (admin or designer only)
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

    if (user.role !== 'admin' && user.role !== 'designer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      unit_id,
      base_cost,
      labor_cost_per_unit,
      supplier,
      notes,
      active,
    } = body;

    const result = await query(
      `UPDATE material_costs SET
        name = COALESCE($1, name),
        unit_id = COALESCE($2, unit_id),
        base_cost = COALESCE($3, base_cost),
        labor_cost_per_unit = COALESCE($4, labor_cost_per_unit),
        supplier = COALESCE($5, supplier),
        notes = COALESCE($6, notes),
        active = COALESCE($7, active),
        updated_by = $8,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [
        name || null,
        unit_id || null,
        base_cost !== undefined ? base_cost : null,
        labor_cost_per_unit !== undefined ? labor_cost_per_unit : null,
        supplier || null,
        notes || null,
        active !== undefined ? active : null,
        user.id,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Material cost not found' }, { status: 404 });
    }

    return NextResponse.json({ cost: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error updating material cost:', error);
    return NextResponse.json(
      { error: 'Failed to update material cost', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cost-libraries/material-costs/[id]
 * Soft delete a material cost (admin only)
 */
export async function DELETE(
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

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await query(
      'UPDATE material_costs SET active = false, updated_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [user.id, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Material cost not found' }, { status: 404 });
    }

    return NextResponse.json({ cost: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error deleting material cost:', error);
    return NextResponse.json(
      { error: 'Failed to delete material cost', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

