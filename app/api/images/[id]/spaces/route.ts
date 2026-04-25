import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/images/[id]/spaces
 * Get all spaces assigned to an image
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
      `SELECT s.* FROM spaces s
       JOIN image_spaces is_rel ON s.id = is_rel.space_id
       WHERE is_rel.image_id = $1
       ORDER BY s.display_order, s.name`,
      [id]
    );

    return NextResponse.json({
      spaces: result.rows,
      count: result.rows.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching image spaces:', error);
    return NextResponse.json(
      { error: 'Failed to fetch image spaces', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/images/[id]/spaces
 * Assign spaces to an image (many-to-many)
 * Body: { space_ids: string[] }
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
    const { space_ids } = body;

    if (!Array.isArray(space_ids)) {
      return NextResponse.json({ error: 'space_ids must be an array' }, { status: 400 });
    }

    // Delete existing assignments
    await query('DELETE FROM image_spaces WHERE image_id = $1', [id]);

    // Insert new assignments
    if (space_ids.length > 0) {
      const values = space_ids.map((spaceId: string, index: number) => 
        `($1, $${index + 2})`
      ).join(', ');
      
      const paramsArray = [id, ...space_ids];
      await query(
        `INSERT INTO image_spaces (image_id, space_id) VALUES ${values}`,
        paramsArray
      );
    }

    // Update quotation items to link to spaces (non-blocking)
    (async () => {
      try {
        // Get image's project
        const imageResult = await query(
          'SELECT project_id FROM images WHERE id = $1',
          [id]
        );

        if (imageResult.rows.length > 0) {
          const projectId = imageResult.rows[0].project_id;
          
          // Get quotation for project
          const quoteResult = await query(
            'SELECT id FROM quotes WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
            [projectId]
          );

          if (quoteResult.rows.length > 0) {
            const quoteId = quoteResult.rows[0].id;
            
            // Get current version
            const versionResult = await query(
              `SELECT id FROM quote_versions 
               WHERE quote_id = $1 
               ORDER BY version_number DESC 
               LIMIT 1`,
              [quoteId]
            );

            if (versionResult.rows.length > 0) {
              const versionId = versionResult.rows[0].id;
              
              // Update items linked to this image to use the first assigned space
              if (space_ids.length > 0) {
                await query(
                  `UPDATE quote_items 
                   SET space_id = $1 
                   WHERE quote_version_id = $2 AND image_id = $3 AND space_id IS NULL`,
                  [space_ids[0], versionId, id]
                );
              }
            }
          }
        }
      } catch (error) {
        // Don't fail space assignment if quotation update fails
        console.error('Error updating quotation items with space (non-blocking):', error);
      }
    })();

    // Return updated spaces
    const result = await query(
      `SELECT s.* FROM spaces s
       JOIN image_spaces is_rel ON s.id = is_rel.space_id
       WHERE is_rel.image_id = $1
       ORDER BY s.display_order, s.name`,
      [id]
    );

    return NextResponse.json({
      spaces: result.rows,
      count: result.rows.length,
    });
  } catch (error: unknown) {
    console.error('Error assigning spaces to image:', error);
    return NextResponse.json(
      { error: 'Failed to assign spaces', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

