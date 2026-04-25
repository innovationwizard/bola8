import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/elements/[id]
 * Get a single element by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Verify authentication
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const elementId = id;

    const result = await query('SELECT * FROM elements WHERE id = $1', [elementId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Element not found' }, { status: 404 });
    }

    return NextResponse.json({ element: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error fetching element:', error);
    return NextResponse.json(
      { error: 'Failed to fetch element', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/elements/[id]
 * Update an existing element (admin or designer only)
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Verify authentication and authorization
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'designer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const elementId = id;
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
      active,
    } = body;

    // Check if element exists
    const checkResult = await query('SELECT id FROM elements WHERE id = $1', [elementId]);
    if (checkResult.rows.length === 0) {
      return NextResponse.json({ error: 'Element not found' }, { status: 404 });
    }

    const sql = `
      UPDATE elements SET
        name = COALESCE($1, name),
        name_es = COALESCE($2, name_es),
        category = COALESCE($3, category),
        description = COALESCE($4, description),
        leonardo_prompt = COALESCE($5, leonardo_prompt),
        negative_prompt = COALESCE($6, negative_prompt),
        placement_hints = COALESCE($7, placement_hints),
        common_uses = COALESCE($8, common_uses),
        dimensions = COALESCE($9, dimensions),
        style = COALESCE($10, style),
        color = COALESCE($11, color),
        material = COALESCE($12, material),
        active = COALESCE($13, active),
        updated_by = $14,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $15
      RETURNING *
    `;

    const result = await query(sql, [
      name || null,
      name_es || null,
      category || null,
      description || null,
      leonardo_prompt || null,
      negative_prompt || null,
      placement_hints || null,
      common_uses || null,
      dimensions ? JSON.stringify(dimensions) : null,
      style || null,
      color || null,
      material || null,
      active !== undefined ? active : null,
      user.id,
      elementId,
    ]);

    return NextResponse.json({ element: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error updating element:', error);
    return NextResponse.json(
      { error: 'Failed to update element', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/elements/[id]
 * Soft delete an element (admin only)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Verify authentication and authorization
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const elementId = id;

    const result = await query(
      'UPDATE elements SET active = false, updated_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [user.id, elementId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Element not found' }, { status: 404 });
    }

    return NextResponse.json({ element: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error deleting element:', error);
    return NextResponse.json(
      { error: 'Failed to delete element', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

