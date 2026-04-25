import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/spaces/[id]
 * Get a single space
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

    const result = await query('SELECT * FROM spaces WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    return NextResponse.json({ space: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error fetching space:', error);
    return NextResponse.json(
      { error: 'Failed to fetch space', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/spaces/[id]
 * Update a space
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

    const body = await request.json();
    const { name, description, display_order } = body;

    const result = await query(
      `UPDATE spaces SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        display_order = COALESCE($3, display_order),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [name || null, description || null, display_order || null, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    return NextResponse.json({ space: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error updating space:', error);
    return NextResponse.json(
      { error: 'Failed to update space', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/spaces/[id]
 * Delete a space
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

    const result = await query('DELETE FROM spaces WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    return NextResponse.json({ space: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error deleting space:', error);
    return NextResponse.json(
      { error: 'Failed to delete space', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

