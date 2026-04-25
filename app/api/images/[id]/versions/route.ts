import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/images/[id]/versions
 * Get all versions of an image (original + all enhancements)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const imageId = id;

    // First, get the image
    const imageResult = await query(
      `SELECT * FROM images WHERE id = $1`,
      [imageId]
    );

    if (imageResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }

    const image = imageResult.rows[0];
    
    // Determine the root image (original)
    let rootImageId: string;
    if (image.parent_image_id) {
      // This is an enhanced version, find the root
      rootImageId = image.parent_image_id;
    } else {
      // This is the original (or a standalone image)
      rootImageId = imageId;
    }

    // Get the root image
    const rootResult = await query(
      `SELECT * FROM images WHERE id = $1`,
      [rootImageId]
    );
    
    if (rootResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Root image not found' },
        { status: 404 }
      );
    }
    
    const rootImage = rootResult.rows[0];

    // Get all enhanced versions (ordered by version number)
    const versionsResult = await query(
      `SELECT * FROM images 
       WHERE parent_image_id = $1 
       ORDER BY version ASC, created_at ASC`,
      [rootImageId]
    );

    const versions = versionsResult.rows;

    // Combine original + versions
    // Mark the root as original if it's image_type is 'original', otherwise mark versions appropriately
    const allVersions = [
      {
        ...rootImage,
        version: 0,
        isOriginal: rootImage.image_type === 'original',
      },
      ...versions.map(v => ({
        ...v,
        isOriginal: false,
      })),
    ];

    return NextResponse.json({
      versions: allVersions,
      count: allVersions.length,
    });
  } catch (error: unknown) {
    console.error('Error fetching image versions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch versions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

