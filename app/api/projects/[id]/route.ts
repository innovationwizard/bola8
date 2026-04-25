import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/projects/[id] - Get a single project with all related data
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = id;

    // Get project
    const projectResult = await query(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const project = projectResult.rows[0];

    // Get related data
    const [siteVisits, images, quotes, designFiles, reviews] = await Promise.all([
      query('SELECT * FROM site_visits WHERE project_id = $1 ORDER BY visit_date DESC', [projectId]),
      query('SELECT * FROM images WHERE project_id = $1 ORDER BY created_at DESC', [projectId]),
      query('SELECT * FROM quotes WHERE project_id = $1 ORDER BY created_at DESC', [projectId]),
      query('SELECT * FROM design_files WHERE project_id = $1 ORDER BY created_at DESC', [projectId]),
      query('SELECT * FROM client_reviews WHERE project_id = $1 ORDER BY review_round DESC', [projectId]),
    ]);

    return NextResponse.json({
      project,
      site_visits: siteVisits.rows,
      images: images.rows,
      quotes: quotes.rows,
      design_files: designFiles.rows,
      reviews: reviews.rows,
    });
  } catch (error: unknown) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[id] - Update a project
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = id;
    const body = await request.json();

    const allowedFields = [
      'client_name',
      'client_email',
      'client_phone',
      'project_name',
      'project_type',
      'status',
      'budget_range',
      'room_type',
      'notes',
    ];

    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(body)) {
      if (allowedFields.includes(key) && value !== undefined) {
        // Ensure value is a valid query parameter type
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
          updates.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    values.push(projectId);
    const sql = `
      UPDATE projects
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ project: result.rows[0] });
  } catch (error: unknown) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - Delete a project
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = id;

    const result = await query('DELETE FROM projects WHERE id = $1 RETURNING id', [projectId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Project deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

