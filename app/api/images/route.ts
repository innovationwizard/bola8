import { NextResponse } from 'next/server';
import { query, QueryParams } from '@/lib/db';
import { getStorageConfig, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';

// POST /api/images - Save an image (original or enhanced) to Supabase Storage and database
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const projectId = formData.get('project_id') as string;
    const siteVisitId = formData.get('site_visit_id') as string | null;
    const imageType = formData.get('image_type') as string;
    const file = formData.get('file') as File | null;
    const url = formData.get('url') as string | null;
    const leonardoImageId = formData.get('leonardo_image_id') as string | null;
    const metadata = formData.get('metadata') as string | null;

    if (!projectId || !imageType) {
      return NextResponse.json(
        { error: 'Missing required fields: project_id, image_type' },
        { status: 400 }
      );
    }

    let storagePath: string | null = null;
    let storageBucket: string | null = null;
    let storedUrl: string | null = url;

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());

      let category: 'original_upload' | 'leonardo_enhanced' | 'project_image';
      if (imageType === 'enhanced') category = 'leonardo_enhanced';
      else if (imageType === 'original') category = 'original_upload';
      else category = 'project_image';

      const config = getStorageConfig(file, category, projectId);
      storagePath = config.path;
      storageBucket = config.bucket;

      await uploadBuffer(storageBucket, storagePath, buffer, file.type || 'application/octet-stream');
      storedUrl = getPublicUrl(storageBucket, storagePath);
    }

    let metadataObj = null;
    if (metadata) {
      try { metadataObj = JSON.parse(metadata); } catch { /* ignore */ }
    }

    const originalUrl = imageType === 'original' ? storedUrl : null;
    const enhancedUrl = imageType === 'enhanced' ? storedUrl : null;

    const result = await query(
      `INSERT INTO images (
        project_id, site_visit_id, image_type, original_url, enhanced_url,
        leonardo_image_id, s3_key, s3_bucket, filename, mime_type, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        projectId, siteVisitId || null, imageType, originalUrl, enhancedUrl,
        leonardoImageId || null, storagePath, storageBucket,
        file?.name || null, file?.type || null,
        metadataObj ? JSON.stringify(metadataObj) : null,
      ]
    );

    return NextResponse.json({ image: result.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error saving image:', error);
    return NextResponse.json(
      { error: 'Failed to save image', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET /api/images
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const imageType = searchParams.get('image_type');

    let sql = 'SELECT * FROM images WHERE 1=1';
    const params: QueryParams = [];
    let paramIndex = 1;

    if (projectId) { sql += ` AND project_id = $${paramIndex}`; params.push(projectId); paramIndex++; }
    if (imageType) { sql += ` AND image_type = $${paramIndex}`; params.push(imageType); paramIndex++; }
    sql += ' ORDER BY created_at DESC';

    const result = await query(sql, params);
    return NextResponse.json({ images: result.rows });
  } catch (error: unknown) {
    console.error('Error fetching images:', error);
    return NextResponse.json(
      { error: 'Failed to fetch images', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
