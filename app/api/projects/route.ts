import { NextResponse } from 'next/server';
import { query, QueryParams } from '@/lib/db';

// GET /api/projects - List all projects
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const projectType = searchParams.get('project_type');

    let sql = `
      SELECT 
        p.*,
        COUNT(DISTINCT q.id) as quote_count,
        COUNT(DISTINCT i.id) as image_count,
        COUNT(DISTINCT sv.id) as site_visit_count,
        MAX(p.updated_at) as last_activity
      FROM projects p
      LEFT JOIN quotes q ON q.project_id = p.id
      LEFT JOIN images i ON i.project_id = p.id
      LEFT JOIN site_visits sv ON sv.project_id = p.id
    `;

    const conditions: string[] = [];
    const params: QueryParams = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`p.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (projectType) {
      conditions.push(`p.project_type = $${paramIndex}`);
      params.push(projectType);
      paramIndex++;
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` GROUP BY p.id ORDER BY p.updated_at DESC`;

    const result = await query(sql, params);

    return NextResponse.json({
      projects: result.rows,
      count: result.rows.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      client_name,
      client_email,
      client_phone,
      project_name,
      project_type,
      budget_range,
      room_type,
      notes,
    } = body;

    if (!client_name || !project_name || !project_type) {
      return NextResponse.json(
        { error: 'Missing required fields: client_name, project_name, project_type' },
        { status: 400 }
      );
    }

    if (!['space_design', 'furniture_design'].includes(project_type)) {
      return NextResponse.json(
        { error: 'Invalid project_type. Must be "space_design" or "furniture_design"' },
        { status: 400 }
      );
    }

    const sql = `
      INSERT INTO projects (
        client_name, client_email, client_phone, project_name,
        project_type, budget_range, room_type, notes, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'lead')
      RETURNING *
    `;

    const result = await query(sql, [
      client_name,
      client_email || null,
      client_phone || null,
      project_name,
      project_type,
      budget_range || null,
      room_type || null,
      notes || null,
    ]);

    return NextResponse.json({ project: result.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

