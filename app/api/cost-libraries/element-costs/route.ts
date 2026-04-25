import { NextResponse } from 'next/server';
import { query, QueryParams } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/cost-libraries/element-costs
 * List element costs with optional filters
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const elementId = searchParams.get('element_id');
    const active = searchParams.get('active');

    let sql = `
      SELECT ec.*, e.name as element_name, e.name_es as element_name_es,
             cu.name as unit_name, cu.symbol as unit_symbol
      FROM element_costs ec
      LEFT JOIN elements e ON ec.element_id = e.id
      LEFT JOIN cost_units cu ON ec.unit_id = cu.id
      WHERE 1=1
    `;
    const params: QueryParams = [];
    let paramIndex = 1;

    if (elementId) {
      sql += ` AND ec.element_id = $${paramIndex}`;
      params.push(elementId);
      paramIndex++;
    }

    if (active !== null && active !== '') {
      sql += ` AND ec.active = $${paramIndex}`;
      params.push(active === 'true');
      paramIndex++;
    }

    sql += ' ORDER BY ec.name ASC';

    const result = await query(sql, params);

    return NextResponse.json({
      costs: result.rows,
      count: result.rows.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching element costs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch element costs', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cost-libraries/element-costs
 * Create a new element cost (admin or designer only)
 */
export async function POST(request: Request) {
  try {
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
      element_id,
      name,
      unit_id,
      base_cost,
      labor_cost_per_unit,
      supplier,
      notes,
    } = body;

    if (!name || !unit_id || base_cost === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: name, unit_id, base_cost' },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO element_costs (
        element_id, name, unit_id, base_cost, labor_cost_per_unit,
        supplier, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        element_id || null,
        name,
        unit_id,
        base_cost,
        labor_cost_per_unit || 0,
        supplier || null,
        notes || null,
        user.id,
      ]
    );

    return NextResponse.json({ cost: result.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating element cost:', error);
    return NextResponse.json(
      { error: 'Failed to create element cost', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

