import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getQuotationVersion } from '@/lib/quotation-engine';

/**
 * GET /api/quotes/[id]/versions/[versionId]
 * Get a specific quotation version with items
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const version = await getQuotationVersion(versionId);

    if (!version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    return NextResponse.json({ version });
  } catch (error: unknown) {
    console.error('Error fetching quotation version:', error);
    return NextResponse.json(
      { error: 'Failed to fetch version', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/quotes/[id]/versions/[versionId]
 * Update version (mark as final, update description)
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;
    const session = await getSession();
    const user = session?.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { is_final, changes_description } = body;

    const result = await query(
      `UPDATE quote_versions SET
        is_final = COALESCE($1, is_final),
        changes_description = COALESCE($2, changes_description)
       WHERE id = $3
       RETURNING *`,
      [is_final !== undefined ? is_final : null, changes_description || null, versionId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    const version = await getQuotationVersion(versionId);

    return NextResponse.json({ version });
  } catch (error: unknown) {
    console.error('Error updating quotation version:', error);
    return NextResponse.json(
      { error: 'Failed to update version', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

