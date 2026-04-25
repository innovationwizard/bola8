import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/spaces?project_id=...
 * List all spaces for a project
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const result = await query(
      'SELECT * FROM spaces WHERE project_id = $1 ORDER BY display_order, name ASC',
      [projectId]
    );

    return NextResponse.json({
      spaces: result.rows,
      count: result.rows.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching spaces:', error);
    return NextResponse.json(
      { error: 'Failed to fetch spaces', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/spaces
 * Create a new space
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { project_id, name, description, display_order } = body;

    if (!project_id || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: project_id, name' },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO spaces (project_id, name, description, display_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [project_id, name, description || null, display_order || 0]
    );

    return NextResponse.json({ space: result.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating space:', error);
    return NextResponse.json(
      { error: 'Failed to create space', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

