import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Config, getS3Url, S3_REGION } from '@/lib/s3-utils';

const s3Client = new S3Client({
  region: S3_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

// GET /api/projects/[id]/files - Get all files for a project, optionally filtered by workflow step
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = id;
    const { searchParams } = new URL(request.url);
    const workflowStep = searchParams.get('workflow_step');

    // Get files from both design_files and images tables
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

    // Also get images
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
    const imgParamIndex = 2;

    if (workflowStep) {
      imagesSql += ` AND workflow_step = $${imgParamIndex}`;
      imagesParams.push(workflowStep);
    }

    imagesSql += ' ORDER BY created_at DESC';

    const imagesResult = await query(imagesSql, imagesParams);

    return NextResponse.json({
      files: filesResult.rows,
      images: imagesResult.rows,
    });
  } catch (error: unknown) {
    console.error('Error fetching files:', error);
    return NextResponse.json(
      { error: 'Failed to fetch files', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/files - Upload a file for a project
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = id;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const workflowStep = formData.get('workflow_step') as string | null;
    const description = formData.get('description') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!workflowStep) {
      return NextResponse.json(
        { error: 'Missing required field: workflow_step' },
        { status: 400 }
      );
    }

    // Determine file category and get S3 config
    const isImage = file.type.startsWith('image/');
    
    // For non-image files, determine if it's a design file
    const isDesignFile = !isImage && (
      file.name.match(/\.(dwg|dxf|skp|3dm|rhino|ai|eps|psd|blend|max|fbx)$/i) ||
      description?.toLowerCase().includes('design') ||
      description?.toLowerCase().includes('drawing') ||
      description?.toLowerCase().includes('render') ||
      description?.toLowerCase().includes('technical') ||
      description?.toLowerCase().includes('presentation')
    );

    const category = isImage 
      ? 'project_image' 
      : (isDesignFile ? 'design_file' : 'document');
    
    const s3Config = getS3Config(file, category, projectId, workflowStep);

    // Upload to S3
    const buffer = Buffer.from(await file.arrayBuffer());

    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: s3Config.key,
        Body: buffer,
        ContentType: file.type || 'application/octet-stream',
      })
    );

    const fileUrl = getS3Url(s3Config.bucket, s3Config.key);

    if (isImage) {
      // Save to images table - project images go to bola8-images bucket
      const sql = `
        INSERT INTO images (
          project_id, workflow_step, image_type, original_url,
          s3_key, s3_bucket, filename, mime_type
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const result = await query(sql, [
        projectId,
        workflowStep,
        'photo',
        fileUrl,
        s3Config.key,
        s3Config.bucket,
        file.name,
        file.type,
      ]);

      return NextResponse.json({ file: result.rows[0], type: 'image' }, { status: 201 });
    } else {
      // Save to design_files table
      // Determine file_type for database
      let dbFileType = 'document';
      if (isDesignFile) {
        if (file.name.match(/\.(dwg|dxf)$/i)) {
          dbFileType = 'drawing';
        } else if (file.name.match(/\.(skp|3dm|rhino|blend|max|fbx)$/i)) {
          dbFileType = 'render';
        } else if (file.name.match(/\.(ai|eps|psd)$/i)) {
          dbFileType = 'presentation';
        } else {
          dbFileType = 'technical';
        }
      }

      const sql = `
        INSERT INTO design_files (
          project_id, workflow_step, file_type, file_name,
          file_url, storage_type, s3_key, s3_bucket, mime_type, file_size, description
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const result = await query(sql, [
        projectId,
        workflowStep,
        dbFileType,
        file.name,
        fileUrl,
        's3',
        s3Config.key,
        s3Config.bucket,
        file.type,
        file.size,
        description || null,
      ]);

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

