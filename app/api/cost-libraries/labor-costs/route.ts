import { NextResponse } from 'next/server';
import { query, QueryParams } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/cost-libraries/labor-costs
 * List labor costs with optional filters
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const active = searchParams.get('active');

    let sql = `
      SELECT lc.*, cu.name as unit_name, cu.symbol as unit_symbol
      FROM labor_costs lc
      LEFT JOIN cost_units cu ON lc.unit_id = cu.id
      WHERE 1=1
    `;
    const params: QueryParams = [];
    let paramIndex = 1;

    if (category) {
      sql += ` AND lc.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (active !== null && active !== '') {
      sql += ` AND lc.active = $${paramIndex}`;
      params.push(active === 'true');
      paramIndex++;
    }

    sql += ' ORDER BY lc.name ASC';

    const result = await query(sql, params);

    return NextResponse.json({
      costs: result.rows,
      count: result.rows.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching labor costs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch labor costs', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cost-libraries/labor-costs
 * Create a new labor cost (admin or designer only)
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
      name,
      name_es,
      category,
      unit_id,
      rate_per_unit,
      description,
    } = body;

    if (!name || !unit_id || rate_per_unit === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: name, unit_id, rate_per_unit' },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO labor_costs (
        name, name_es, category, unit_id, rate_per_unit, description, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        name,
        name_es || null,
        category || null,
        unit_id,
        rate_per_unit,
        description || null,
        user.id,
      ]
    );

    return NextResponse.json({ cost: result.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating labor cost:', error);
    return NextResponse.json(
      { error: 'Failed to create labor cost', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

