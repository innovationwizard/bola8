import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getStorageConfig, getPublicUrl, uploadBuffer } from '@/lib/storage-utils';

// GET /api/projects/[id]/files
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const workflowStep = searchParams.get('workflow_step');

    let filesSql = `
      SELECT
        id, project_id, workflow_step, file_name as filename, file_url as url,
        storage_type, s3_key, s3_bucket, mime_type, file_size as size,
        description, created_at, 'file' as source
      FROM design_files
      WHERE project_id = $1
    `;
    const params_array: (string | number | boolean | null)[] = [projectId];
    let paramIndex = 2;

    if (workflowStep) {
      filesSql += ` AND workflow_step = $${paramIndex}`;
      params_array.push(workflowStep);
      paramIndex++;
    }
    filesSql += ' ORDER BY created_at DESC';
    const filesResult = await query(filesSql, params_array);

    let imagesSql = `
      SELECT
        id, project_id, workflow_step, filename,
        COALESCE(original_url, enhanced_url) as url,
        s3_key, s3_bucket, mime_type, NULL as size,
        NULL as description, created_at, 'image' as source
      FROM images
      WHERE project_id = $1 AND image_type IN ('photo', 'file')
    `;
    const imagesParams: (string | number | boolean | null)[] = [projectId];

    if (workflowStep) {
      imagesSql += ` AND workflow_step = $2`;
      imagesParams.push(workflowStep);
    }
    imagesSql += ' ORDER BY created_at DESC';
    const imagesResult = await query(imagesSql, imagesParams);

    return NextResponse.json({ files: filesResult.rows, images: imagesResult.rows });
  } catch (error: unknown) {
    console.error('Error fetching files:', error);
    return NextResponse.json(
      { error: 'Failed to fetch files', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/files
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const workflowStep = formData.get('workflow_step') as string | null;
    const description = formData.get('description') as string | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!workflowStep) {
      return NextResponse.json({ error: 'Missing required field: workflow_step' }, { status: 400 });
    }

    const isImage = file.type.startsWith('image/');
    const isDesignFile =
      !isImage &&
      (file.name.match(/\.(dwg|dxf|skp|3dm|rhino|ai|eps|psd|blend|max|fbx)$/i) ||
        description?.toLowerCase().includes('design') ||
        description?.toLowerCase().includes('drawing') ||
        description?.toLowerCase().includes('render') ||
        description?.toLowerCase().includes('technical') ||
        description?.toLowerCase().includes('presentation'));

    const category = isImage ? 'project_image' : isDesignFile ? 'design_file' : 'document';
    const config = getStorageConfig(file, category, projectId, workflowStep);

    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadBuffer(config.bucket, config.path, buffer, file.type || 'application/octet-stream');
    const fileUrl = getPublicUrl(config.bucket, config.path);

    if (isImage) {
      const result = await query(
        `INSERT INTO images (project_id, workflow_step, image_type, original_url, s3_key, s3_bucket, filename, mime_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [projectId, workflowStep, 'photo', fileUrl, config.path, config.bucket, file.name, file.type]
      );
      return NextResponse.json({ file: result.rows[0], type: 'image' }, { status: 201 });
    } else {
      let dbFileType = 'document';
      if (isDesignFile) {
        if (file.name.match(/\.(dwg|dxf)$/i)) dbFileType = 'drawing';
        else if (file.name.match(/\.(skp|3dm|rhino|blend|max|fbx)$/i)) dbFileType = 'render';
        else if (file.name.match(/\.(ai|eps|psd)$/i)) dbFileType = 'presentation';
        else dbFileType = 'technical';
      }

      const result = await query(
        `INSERT INTO design_files (project_id, workflow_step, file_type, file_name, file_url, storage_type, s3_key, s3_bucket, mime_type, file_size, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [projectId, workflowStep, dbFileType, file.name, fileUrl, 'supabase', config.path, config.bucket, file.type, file.size, description || null]
      );
      return NextResponse.json({ file: result.rows[0], type: 'file' }, { status: 201 });
    }
  } catch (error: unknown) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
