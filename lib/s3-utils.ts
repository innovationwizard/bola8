/**
 * S3 Bucket Organization Strategy:
 * 
 * This module provides a centralized system for organizing files across 5 S3 buckets:
 * 
 * 1. bola8-uploads
 *    Purpose: Original file uploads before processing
 *    Structure: uploads/{projectId}/originals/{timestamp}-{filename}
 *    Use case: Initial uploads from users, temporary storage before categorization
 * 
 * 2. bola8-images
 *    Purpose: General project images (photos, workflow images)
 *    Structure: projects/{projectId}/{workflowStep}/images/{timestamp}-{filename}
 *    Use case: Site visit photos, workflow step photos, general project imagery
 * 
 * 3. bola8-leonardo-images
 *    Purpose: Leonardo AI enhanced/rendered images
 *    Structure: enhanced/{projectId}/{timestamp}-{filename}
 *    Use case: AI-enhanced images from Leonardo AI, final renders
 * 
 * 4. bola8-designs
 *    Purpose: Design files (drawings, renders, presentations, technical drawings)
 *    Structure: projects/{projectId}/{workflowStep}/designs/{timestamp}-{filename}
 *    Use case: CAD files, SketchUp files, Rhino files, render outputs, presentations
 * 
 * 5. bola8-not-images
 *    Purpose: Non-image documents (PDFs, spreadsheets, Word docs, etc.)
 *    Structure: projects/{projectId}/{workflowStep}/documents/{timestamp}-{filename}
 *    Use case: Contracts, quotes, specifications, spreadsheets, other documents
 * 
 * All buckets are in us-east-2 (US East Ohio) region.
 */

export const S3_BUCKETS = {
  UPLOADS: process.env.S3_UPLOAD_BUCKET || 'bola8-uploads',
  IMAGES: process.env.S3_IMAGES_BUCKET || 'bola8-images',
  LEONARDO: process.env.LEONARDO_S3_BUCKET || 'bola8-leonardo-images',
  DESIGNS: process.env.S3_DESIGNS_BUCKET || 'bola8-designs',
  NOT_IMAGES: process.env.S3_NOT_IMAGES_BUCKET || 'bola8-not-images',
} as const;

export const S3_REGION = process.env.AWS_REGION || 'us-east-2';

export type FileCategory = 
  | 'original_upload'      // Original file upload (before processing)
  | 'leonardo_enhanced'    // Leonardo AI enhanced image
  | 'project_image'        // General project image (site visit, workflow photo)
  | 'design_file'         // Design file (drawing, render, presentation, technical)
  | 'document';           // Non-image document (PDF, doc, etc.)

export interface S3UploadConfig {
  bucket: string;
  key: string;
  category: FileCategory;
}

/**
 * Determines the appropriate S3 bucket and key path based on file type and context
 */
export function getS3Config(
  file: File | { name: string; type: string },
  category: FileCategory,
  projectId: string | null,
  workflowStep?: string | null
): S3UploadConfig {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  
  let bucket: string;
  let keyPrefix: string;

  switch (category) {
    case 'original_upload':
      bucket = S3_BUCKETS.UPLOADS;
      keyPrefix = projectId ? `uploads/${projectId}/originals` : 'uploads/originals';
      break;

    case 'leonardo_enhanced':
      bucket = S3_BUCKETS.LEONARDO;
      keyPrefix = projectId ? `enhanced/${projectId}` : 'enhanced';
      break;

    case 'project_image':
      bucket = S3_BUCKETS.IMAGES;
      if (projectId && workflowStep) {
        keyPrefix = `projects/${projectId}/${workflowStep}/images`;
      } else if (projectId) {
        keyPrefix = `projects/${projectId}/images`;
      } else {
        keyPrefix = 'images';
      }
      break;

    case 'design_file':
      bucket = S3_BUCKETS.DESIGNS;
      if (projectId && workflowStep) {
        keyPrefix = `projects/${projectId}/${workflowStep}/designs`;
      } else if (projectId) {
        keyPrefix = `projects/${projectId}/designs`;
      } else {
        keyPrefix = 'designs';
      }
      break;

    case 'document':
      bucket = S3_BUCKETS.NOT_IMAGES;
      if (projectId && workflowStep) {
        keyPrefix = `projects/${projectId}/${workflowStep}/documents`;
      } else if (projectId) {
        keyPrefix = `projects/${projectId}/documents`;
      } else {
        keyPrefix = 'documents';
      }
      break;

    default:
      // Fallback to uploads bucket
      bucket = S3_BUCKETS.UPLOADS;
      keyPrefix = projectId ? `uploads/${projectId}` : 'uploads';
  }

  const key = `${keyPrefix}/${timestamp}-${safeName}`;

  return {
    bucket,
    key,
    category,
  };
}

/**
 * Generates the public S3 URL for an object
 */
export function getS3Url(bucket: string, key: string): string {
  return `https://${bucket}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

/**
 * Determines file category based on file type and context
 */
export function determineFileCategory(
  fileType: string,
  imageType?: string,
  fileTypeField?: string
): FileCategory {
  const isImage = fileType.startsWith('image/');

  // If it's an enhanced image from Leonardo
  if (imageType === 'enhanced' || imageType === 'leonardo') {
    return 'leonardo_enhanced';
  }

  // If it's a design-related file type
  if (fileTypeField === 'drawing' || 
      fileTypeField === 'render' || 
      fileTypeField === 'presentation' || 
      fileTypeField === 'technical') {
    return 'design_file';
  }

  // If it's an image but not enhanced
  if (isImage) {
    return 'project_image';
  }

  // Everything else is a document
  return 'document';
}

