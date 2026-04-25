/**
 * Supabase Storage — replaces the former AWS S3 utility.
 *
 * Bucket layout (must be created in the Supabase dashboard with "Public" enabled):
 *   uploads   – original files before processing
 *   images    – general project photos / workflow images
 *   renders   – Leonardo AI & Stable Diffusion enhanced renders
 *   designs   – CAD / SketchUp / technical design files
 *   documents – PDFs, spreadsheets, Word docs, etc.
 */

import { supabase } from '@/lib/supabase';

export const STORAGE_BUCKETS = {
  UPLOADS: 'uploads',
  IMAGES: 'images',
  COMPOSITIONS: 'compositions',
  DESIGNS: 'designs',
  DOCUMENTS: 'documents',
} as const;

export type FileCategory =
  | 'original_upload'
  | 'leonardo_enhanced'
  | 'project_image'
  | 'design_file'
  | 'document';

export interface StorageUploadConfig {
  bucket: string;
  path: string;
  category: FileCategory;
}

export function getStorageConfig(
  file: File | { name: string; type: string },
  category: FileCategory,
  projectId: string | null,
  workflowStep?: string | null
): StorageUploadConfig {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');

  let bucket: string;
  let prefix: string;

  switch (category) {
    case 'original_upload':
      bucket = STORAGE_BUCKETS.UPLOADS;
      prefix = projectId ? `uploads/${projectId}/originals` : 'uploads/originals';
      break;

    case 'leonardo_enhanced':
      bucket = STORAGE_BUCKETS.COMPOSITIONS;
      prefix = projectId ? `enhanced/${projectId}` : 'enhanced';
      break;

    case 'project_image':
      bucket = STORAGE_BUCKETS.IMAGES;
      if (projectId && workflowStep) {
        prefix = `projects/${projectId}/${workflowStep}/images`;
      } else if (projectId) {
        prefix = `projects/${projectId}/images`;
      } else {
        prefix = 'images';
      }
      break;

    case 'design_file':
      bucket = STORAGE_BUCKETS.DESIGNS;
      if (projectId && workflowStep) {
        prefix = `projects/${projectId}/${workflowStep}/designs`;
      } else if (projectId) {
        prefix = `projects/${projectId}/designs`;
      } else {
        prefix = 'designs';
      }
      break;

    case 'document':
      bucket = STORAGE_BUCKETS.DOCUMENTS;
      if (projectId && workflowStep) {
        prefix = `projects/${projectId}/${workflowStep}/documents`;
      } else if (projectId) {
        prefix = `projects/${projectId}/documents`;
      } else {
        prefix = 'documents';
      }
      break;

    default:
      bucket = STORAGE_BUCKETS.UPLOADS;
      prefix = projectId ? `uploads/${projectId}` : 'uploads';
  }

  return { bucket, path: `${prefix}/${timestamp}-${safeName}`, category };
}

export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadBuffer(
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

export function determineFileCategory(
  fileType: string,
  imageType?: string,
  fileTypeField?: string
): FileCategory {
  const isImage = fileType.startsWith('image/');

  if (imageType === 'enhanced' || imageType === 'leonardo') return 'leonardo_enhanced';

  if (
    fileTypeField === 'drawing' ||
    fileTypeField === 'render' ||
    fileTypeField === 'presentation' ||
    fileTypeField === 'technical'
  ) {
    return 'design_file';
  }

  if (isImage) return 'project_image';
  return 'document';
}
