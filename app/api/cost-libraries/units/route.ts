import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/cost-libraries/units
 * List all cost units
 */
export async function GET() {
  try {
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await query('SELECT * FROM cost_units ORDER BY name ASC');

    return NextResponse.json({
      units: result.rows,
      count: result.rows.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching cost units:', error);
    return NextResponse.json(
      { error: 'Failed to fetch units', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

