/**
 * Image Storage Utilities
 * 
 * Handles automatic saving of images and enhancements to database
 * Auto-creates projects when needed
 */

import { query } from './index';

export interface ImageMetadata {
  enhancement_type?: 'general' | 'targeted' | 'color' | 'lighting' | 'elements' | 'training';
  mode?: string;
  replacements?: Array<{
    targetElement: string;
    fromMaterialId?: string | null;
    toMaterialId?: string;
    fromColor?: string | null;
    toColor?: string;
  }>;
  lightingConfig?: {
    lightSources: Array<{
      type: string;
      position: { x: number; y: number; z: number };
      strength: number;
      warmth: number;
      color: string;
    }>;
    overallWarmth: number;
    overallBrightness: number;
  };
  elements?: Array<{
    id: string;
    name: string;
  }>;
  placementInstructions?: string | null;
  parameters?: {
    init_strength?: number;
    guidance_scale?: number;
    width?: number;
    height?: number;
  };
  leonardoImageId?: string;
  generationId?: string;
  // Training-specific fields
  option?: string; // 'A', 'B', etc.
  provider?: string; // 'leonardo', 'stablediffusion'
  prompt_version?: string;
}

export interface SaveImageParams {
  projectId: string | null;
  siteVisitId?: string | null;
  workflowStep?: string | null;
  imageType: 'original' | 'enhanced' | 'render' | 'technical' | 'other' | 'photo' | 'file';
  originalUrl?: string | null;
  enhancedUrl?: string | null;
  leonardoImageId?: string | null;
  s3Key?: string | null;
  s3Bucket?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  metadata?: ImageMetadata | null;
  parentImageId?: string | null; // Link to original image
}

/**
 * Auto-create a project if projectId is not provided
 */
export async function ensureProject(projectId: string | null): Promise<string> {
  if (projectId) {
    // Verify project exists
    const check = await query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (check.rows.length > 0) {
      return projectId;
    }
  }

  // Create new project for standalone enhancement
  const result = await query(
    `INSERT INTO projects (
      client_name, project_name, project_type, status, notes
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING id`,
    [
      'Cliente Temporal',
      `Proyecto de Mejora - ${new Date().toLocaleDateString('es-MX')}`,
      'space_design', // Default type
      'design', // Start at design step since they're enhancing
      'Proyecto creado automáticamente para almacenar mejoras de imagen'
    ]
  );

  return result.rows[0].id;
}

/**
 * Save image to database (original or enhanced)
 * Auto-creates project if projectId is null
 */
export async function saveImageToDatabase(params: SaveImageParams): Promise<Record<string, unknown>> {
  try {
    // Auto-create project if needed
    const finalProjectId = await ensureProject(params.projectId);

    // Determine version number if this is an enhancement
    let version = 1;
    if (params.parentImageId) {
      const versionResult = await query(
        'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM images WHERE parent_image_id = $1',
        [params.parentImageId]
      );
      version = parseInt(versionResult.rows[0].next_version) || 1;
    }

    const sql = `
      INSERT INTO images (
        project_id, site_visit_id, workflow_step, image_type,
        original_url, enhanced_url, leonardo_image_id,
        s3_key, s3_bucket, filename, mime_type,
        width, height, metadata, parent_image_id,
        enhancement_type, enhancement_metadata, version
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `;

    // Prepare metadata JSONB
    const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;
    
    // Extract enhancement metadata separately for easier querying
    const enhancementMetadata = params.metadata ? {
      replacements: params.metadata.replacements,
      lightingConfig: params.metadata.lightingConfig,
      parameters: params.metadata.parameters,
    } : null;

    const result = await query(sql, [
      finalProjectId,
      params.siteVisitId || null,
      params.workflowStep || null,
      params.imageType,
      params.originalUrl || null,
      params.enhancedUrl || null,
      params.leonardoImageId || null,
      params.s3Key || null,
      params.s3Bucket || null,
      params.filename || null,
      params.mimeType || null,
      params.width || null,
      params.height || null,
      metadataJson,
      params.parentImageId || null,
      params.metadata?.enhancement_type || null,
      enhancementMetadata ? JSON.stringify(enhancementMetadata) : null,
      version,
    ]);

    const savedImage = { ...result.rows[0], project_id: finalProjectId };

    // Trigger automatic quotation update if this is an enhanced image (non-blocking)
    if (params.imageType === 'enhanced' && params.metadata?.enhancement_type) {
      // Run asynchronously without blocking
      (async () => {
        try {
          const { createQuotationVersionFromImage, getOrCreateQuotation } = await import('@/lib/quotation-engine');
          
          // Get space_id from image_spaces if available (will be set later via UI)
          const spaceResult = await query(
            'SELECT space_id FROM image_spaces WHERE image_id = $1 LIMIT 1',
            [savedImage.id]
          );
          const spaceId = spaceResult.rows.length > 0 ? spaceResult.rows[0].space_id : null;

          // Get or create quotation and create new version
          const quoteId = await getOrCreateQuotation(finalProjectId);
          await createQuotationVersionFromImage(quoteId, savedImage.id, spaceId);
          console.log('✅ Quotation automatically updated from image:', savedImage.id);
        } catch (quoteError) {
          // Don't fail image save if quotation update fails
          console.error('Error triggering quotation update (non-blocking):', quoteError);
        }
      })();
    }

    return savedImage;
  } catch (error: unknown) {
    console.error('Error saving image to database:', error);
    throw error;
  }
}


/**
 * Find or create original image record
 * Auto-creates project if projectId is null
 */
export async function findOrCreateOriginalImage(
  projectId: string | null,
  originalS3Info: { bucket: string; key: string; location: string } | null,
  filename: string,
  mimeType: string,
  width?: number,
  height?: number
): Promise<{ imageId: string | null; projectId: string }> {
  if (!originalS3Info) {
    // Still ensure project exists even if no original S3 info
    const finalProjectId = await ensureProject(projectId);
    return { imageId: null, projectId: finalProjectId };
  }

  try {
    // Auto-create project if needed
    const finalProjectId = await ensureProject(projectId);

    // Check if original already exists
    const existing = await query(
      'SELECT id FROM images WHERE s3_key = $1 AND s3_bucket = $2 AND image_type = $3',
      [originalS3Info.key, originalS3Info.bucket, 'original']
    );

    if (existing.rows.length > 0) {
      return { imageId: existing.rows[0].id, projectId: finalProjectId };
    }

    // Create new original image record
    const result = await saveImageToDatabase({
      projectId: finalProjectId,
      imageType: 'original',
      originalUrl: originalS3Info.location,
      s3Key: originalS3Info.key,
      s3Bucket: originalS3Info.bucket,
      filename,
      mimeType,
      width,
      height,
    });

    return { imageId: result.id as string, projectId: finalProjectId };
  } catch (error) {
    console.error('Error finding/creating original image:', error);
    const finalProjectId = await ensureProject(projectId);
    return { imageId: null, projectId: finalProjectId };
  }
}

