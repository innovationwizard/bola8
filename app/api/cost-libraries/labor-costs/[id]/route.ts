import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/cost-libraries/labor-costs/[id]
 * Get a single labor cost
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
      `SELECT lc.*, cu.name as unit_name, cu.symbol as unit_symbol
       FROM labor_costs lc
       LEFT JOIN cost_units cu ON lc.unit_id = cu.id
       WHERE lc.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Labor cost not found' }, { status: 404 });
    }

    return NextResponse.json({ cost: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error fetching labor cost:', error);
    return NextResponse.json(
      { error: 'Failed to fetch labor cost', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/cost-libraries/labor-costs/[id]
 * Update a labor cost (admin or designer only)
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
      name_es,
      category,
      unit_id,
      rate_per_unit,
      description,
      active,
    } = body;

    const result = await query(
      `UPDATE labor_costs SET
        name = COALESCE($1, name),
        name_es = COALESCE($2, name_es),
        category = COALESCE($3, category),
        unit_id = COALESCE($4, unit_id),
        rate_per_unit = COALESCE($5, rate_per_unit),
        description = COALESCE($6, description),
        active = COALESCE($7, active),
        updated_by = $8,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [
        name || null,
        name_es || null,
        category || null,
        unit_id || null,
        rate_per_unit !== undefined ? rate_per_unit : null,
        description || null,
        active !== undefined ? active : null,
        user.id,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Labor cost not found' }, { status: 404 });
    }

    return NextResponse.json({ cost: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error updating labor cost:', error);
    return NextResponse.json(
      { error: 'Failed to update labor cost', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cost-libraries/labor-costs/[id]
 * Soft delete a labor cost (admin only)
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
      'UPDATE labor_costs SET active = false, updated_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [user.id, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Labor cost not found' }, { status: 404 });
    }

    return NextResponse.json({ cost: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error deleting labor cost:', error);
    return NextResponse.json(
      { error: 'Failed to delete labor cost', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

