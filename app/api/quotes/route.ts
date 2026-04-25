import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/quotes?project_id=...
 * List quotations for a project
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
      `SELECT q.*, qv.version_number as current_version_number
       FROM quotes q
       LEFT JOIN quote_versions qv ON q.current_version_id = qv.id
       WHERE q.project_id = $1
       ORDER BY q.created_at DESC`,
      [projectId]
    );

    return NextResponse.json({
      quotes: result.rows,
      count: result.rows.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching quotations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quotations', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

