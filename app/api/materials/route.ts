import { NextResponse } from 'next/server';
import { query, QueryParams } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/materials - List all materials (with optional filters)
export async function GET(request: Request) {
  try {
    // Verify authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const active = searchParams.get('active');
    const search = searchParams.get('search');

    let sql = 'SELECT * FROM materials WHERE 1=1';
    const params: QueryParams = [];
    let paramIndex = 1;

    if (category) {
      sql += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (active !== null) {
      sql += ` AND active = $${paramIndex}`;
      params.push(active === 'true');
      paramIndex++;
    } else {
      // Default to active only
      sql += ` AND active = $${paramIndex}`;
      params.push(true);
      paramIndex++;
    }

    if (search) {
      sql += ` AND (name ILIKE $${paramIndex} OR name_es ILIKE $${paramIndex} OR texture ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ' ORDER BY category, name_es';

    const result = await query(sql, params);

    return NextResponse.json(result.rows);
  } catch (error: unknown) {
    console.error('Error fetching materials:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch materials' },
      { status: 500 }
    );
  }
}

// POST /api/materials - Create new material
export async function POST(request: Request) {
  try {
    // Verify authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.user;

    // Only admins and designers can create materials
    if (user.role !== 'admin' && user.role !== 'designer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      name_es,
      category,
      color,
      texture,
      leonardo_prompt,
      negative_prompt,
      common_uses,
      active = true,
    } = body;

    // Validation
    if (!name || !name_es || !category || !leonardo_prompt) {
      return NextResponse.json(
        { error: 'Missing required fields: name, name_es, category, leonardo_prompt' },
        { status: 400 }
      );
    }

    const validCategories = [
      'flooring', 'furniture', 'wall', 'fabric', 'metal', 'wood',
      'stone', 'glass', 'ceramic', 'paint'
    ];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
        { status: 400 }
      );
    }

    const sql = `
      INSERT INTO materials (
        name, name_es, category, color, texture, leonardo_prompt, 
        negative_prompt, common_uses, active, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await query(sql, [
      name,
      name_es,
      category,
      color || null,
      texture || null,
      leonardo_prompt,
      negative_prompt || null,
      common_uses || null,
      active,
      user.id,
    ]);

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating material:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create material' },
      { status: 500 }
    );
  }
}

