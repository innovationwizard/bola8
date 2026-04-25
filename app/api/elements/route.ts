import { NextResponse } from 'next/server';
import { query, QueryParams } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/elements
 * List all elements with optional filters
 */
export async function GET(request: Request) {
  try {
    // Verify authentication
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const active = searchParams.get('active');

    let sql = 'SELECT * FROM elements WHERE 1=1';
    const params: QueryParams = [];
    let paramIndex = 1;

    if (category) {
      sql += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      sql += ` AND (name ILIKE $${paramIndex} OR name_es ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (active !== null && active !== '') {
      sql += ` AND active = $${paramIndex}`;
      params.push(active === 'true');
      paramIndex++;
    }

    sql += ' ORDER BY category, name_es ASC';

    const result = await query(sql, params);

    return NextResponse.json({
      elements: result.rows,
      count: result.rows.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching elements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch elements', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/elements
 * Create a new element (admin or designer only)
 */
export async function POST(request: Request) {
  try {
    // Verify authentication and authorization
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
      description,
      leonardo_prompt,
      negative_prompt,
      placement_hints,
      common_uses,
      dimensions,
      style,
      color,
      material,
    } = body;

    if (!name || !category || !leonardo_prompt) {
      return NextResponse.json(
        { error: 'Missing required fields: name, category, leonardo_prompt' },
        { status: 400 }
      );
    }

    const validCategories = [
      'chair', 'table', 'sofa', 'coffee_table', 'dining_table', 'desk',
      'cabinet', 'shelf', 'bed', 'nightstand', 'lamp', 'rug', 'curtain',
      'plant', 'artwork', 'accessory', 'other'
    ];

    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
        { status: 400 }
      );
    }

    const sql = `
      INSERT INTO elements (
        name, name_es, category, description, leonardo_prompt, negative_prompt,
        placement_hints, common_uses, dimensions, style, color, material, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const result = await query(sql, [
      name,
      name_es || null,
      category,
      description || null,
      leonardo_prompt,
      negative_prompt || null,
      placement_hints || null,
      common_uses || null,
      dimensions ? JSON.stringify(dimensions) : null,
      style || null,
      color || null,
      material || null,
      user.id,
    ]);

    return NextResponse.json({ element: result.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating element:', error);
    return NextResponse.json(
      { error: 'Failed to create element', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

