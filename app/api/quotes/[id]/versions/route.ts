import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getQuotationVersion } from '@/lib/quotation-engine';

/**
 * GET /api/quotes/[id]/versions
 * List all versions of a quotation
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

    const result = await query(
      `SELECT qv.*, u.name as created_by_name
       FROM quote_versions qv
       LEFT JOIN users u ON qv.created_by = u.id
       WHERE qv.quote_id = $1
       ORDER BY qv.version_number DESC`,
      [id]
    );

    return NextResponse.json({
      versions: result.rows,
      count: result.rows.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching quotation versions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch versions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/quotes/[id]/versions
 * Create a new version (manual creation or from client revision)
 */
export async function POST(
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
    const { changes_description, is_final } = body;

    // Get current version number
    const currentVersionResult = await query(
      `SELECT version_number FROM quote_versions 
       WHERE quote_id = $1 
       ORDER BY version_number DESC 
       LIMIT 1`,
      [id]
    );

    const nextVersion = currentVersionResult.rows.length > 0
      ? currentVersionResult.rows[0].version_number + 1
      : 1;

    // Create new version
    const versionResult = await query(
      `INSERT INTO quote_versions (quote_id, version_number, changes_description, is_final, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        id,
        nextVersion,
        changes_description || `Versión ${nextVersion}`,
        is_final || false,
        user.id,
      ]
    );

    const versionId = versionResult.rows[0].id;

    // Copy items from previous version if exists
    if (nextVersion > 1) {
      const prevVersionResult = await query(
        `SELECT id FROM quote_versions 
         WHERE quote_id = $1 AND version_number = $2`,
        [id, nextVersion - 1]
      );

      if (prevVersionResult.rows.length > 0) {
        const prevVersionId = prevVersionResult.rows[0].id;
        await query(
          `INSERT INTO quote_items (
            quote_version_id, space_id, item_name, category, description,
            dimensions, materials, material_ids, quantity, unit_id,
            unit_cost, labor_cost, subtotal, iva_rate, price_with_iva,
            margin_rate, profit, image_id, notes, display_order
          )
          SELECT 
            $1, space_id, item_name, category, description,
            dimensions, materials, material_ids, quantity, unit_id,
            unit_cost, labor_cost, subtotal, iva_rate, price_with_iva,
            margin_rate, profit, image_id, notes, display_order
          FROM quote_items
          WHERE quote_version_id = $2`,
          [versionId, prevVersionId]
        );
      }
    }

    // Update quote with current version
    await query(
      'UPDATE quotes SET current_version_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [versionId, id]
    );

    const version = await getQuotationVersion(versionId);

    return NextResponse.json({ version }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating quotation version:', error);
    return NextResponse.json(
      { error: 'Failed to create version', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

