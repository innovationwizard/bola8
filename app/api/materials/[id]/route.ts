import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/materials/[id] - Get single material
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sql = 'SELECT * FROM materials WHERE id = $1';
    const result = await query(sql, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: unknown) {
    console.error('Error fetching material:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch material' },
      { status: 500 }
    );
  }
}

// PUT /api/materials/[id] - Update material
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.user;

    // Only admins and designers can update materials
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
      active,
    } = body;

    // Build dynamic update query
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (name_es !== undefined) {
      updates.push(`name_es = $${paramIndex++}`);
      values.push(name_es);
    }
    if (category !== undefined) {
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
      updates.push(`category = $${paramIndex++}`);
      values.push(category);
    }
    if (color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(color || null);
    }
    if (texture !== undefined) {
      updates.push(`texture = $${paramIndex++}`);
      values.push(texture || null);
    }
    if (leonardo_prompt !== undefined) {
      updates.push(`leonardo_prompt = $${paramIndex++}`);
      values.push(leonardo_prompt);
    }
    if (negative_prompt !== undefined) {
      updates.push(`negative_prompt = $${paramIndex++}`);
      values.push(negative_prompt || null);
    }
    if (common_uses !== undefined) {
      updates.push(`common_uses = $${paramIndex++}`);
      values.push(common_uses || null);
    }
    if (active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      values.push(active);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Add updated_by and updated_at
    updates.push(`updated_by = $${paramIndex++}`);
    values.push(user.id);

    values.push(id);

    const sql = `
      UPDATE materials 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: unknown) {
    console.error('Error updating material:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update material' },
      { status: 500 }
    );
  }
}

// DELETE /api/materials/[id] - Delete material (soft delete by setting active=false)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.user;

    // Only admins can delete materials
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Soft delete by setting active = false
    const sql = `
      UPDATE materials 
      SET active = false, updated_by = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await query(sql, [user.id, id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Material deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting material:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete material' },
      { status: 500 }
    );
  }
}

