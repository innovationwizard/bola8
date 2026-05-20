/**
 * Asset pack builder — types + storage + DB persistence primitives.
 *
 * This batch (D1.1) provides only the building blocks. The two builder
 * functions that orchestrate them (per-layer + hybrid) live in batches
 * D1.2 and D1.3 and will be appended to this file. The thin route handler
 * comes in D1.4.
 *
 * Conventions:
 *   - Layer PNGs land in the `compositions` bucket under
 *     `asset-packs/{packId}/{layerType}.png` so the designer sees stable,
 *     readable names when she downloads the ZIP.
 *   - Each layer is also recorded in the `images` table with
 *     asset_pack_id + layer_type so the version history machinery still works.
 *   - All paid-API calls inside the orchestrators (Imagen/Gemini/Bria/Qwen)
 *     pass through their respective lib modules — never bypass logging.
 */

import { query }                           from '@/lib/db';
import { supabase }                        from '@/lib/supabase';
import { STORAGE_BUCKETS, uploadBuffer }   from '@/lib/storage-utils';
import type { BrandDNA, ProjectBrandGuidelines } from '@/lib/brand';
import type { StyleCard }                  from '@/lib/style-card';

// ── Types ─────────────────────────────────────────────────────────────────────

/** The seven layer slots tracked in `images.layer_type` (matches the DB CHECK constraint). */
export type LayerType =
  | 'background'
  | 'building'
  | 'environment'
  | 'featured'
  | 'ornaments'
  | 'people'
  | 'composite';

/** Generation strategy. Matches `asset_packs.generation_path` CHECK constraint. */
export type GenerationPath = 'decompose' | 'per-layer' | 'hybrid';

/** Lifecycle of a pack. Matches `asset_packs.status` CHECK constraint. */
export type PackStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'partial';

/** Optional layers (asset-pack route decides whether to generate based on post content). */
export const OPTIONAL_LAYERS: ReadonlySet<LayerType> = new Set([
  'featured',
  'ornaments',
  'people',
]);

/** Layers that should always exist in a fully-built pack. */
export const REQUIRED_LAYERS: ReadonlySet<LayerType> = new Set([
  'background',
  'building',
  'environment',
  'composite',
]);

/** Per-layer record returned from a builder. */
export interface LayerResult {
  layerType:           LayerType;
  imageId:             string;     // images.id
  storagePath:         string;     // path inside compositions bucket
  signedUrl:           string;     // valid for SIGNED_URL_TTL_SECONDS
  transparencyApplied: boolean;    // false when Bria was skipped or failed
}

/** Result of a full pack build. */
export interface AssetPackResult {
  assetPackId:      string;
  postId:           string;
  projectId:        string;
  status:           PackStatus;
  generationPath:   GenerationPath;
  layers:           LayerResult[];
  styleCard:        StyleCard | null;
}

/** Input data the orchestrators need. Assembled by the route handler. */
export interface BuildContext {
  postId:           string;
  projectId:        string;
  post: {
    idea:           string | null;
    descripcion:    string | null;
    texto_en_arte:  string | null;
    formato:        string | null;
  };
  brand:            BrandDNA               | null;
  projectBrand:     ProjectBrandGuidelines | null;
  /** Pinned render storage_path (may be null — pack still builds without it; building layer is skipped). */
  pinnedRenderPath: string | null;
  /** Pinterest Inspo storage paths for this post (order matters — display_order asc). */
  pinterestPaths:   string[];
  /** Project-level style reference paths (role='style'). */
  styleRefPaths:    string[];
  /** Pinterest Inspo signed URLs — used in the style card sidebar (not for generation). */
  pinterestUrls:    string[];
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days — covers ZIP downloads and casual revisits.

/** Build the canonical storage path for a layer PNG within an asset pack. */
export function buildLayerStoragePath(packId: string, layerType: LayerType): string {
  return `asset-packs/${packId}/${layerType}.png`;
}

/** Upload a layer PNG to the compositions bucket and return its path + signed URL. */
export async function uploadLayer(
  packId:    string,
  layerType: LayerType,
  buffer:    Buffer,
): Promise<{ storagePath: string; signedUrl: string }> {
  const storagePath = buildLayerStoragePath(packId, layerType);
  await uploadBuffer(STORAGE_BUCKETS.COMPOSITIONS, storagePath, buffer, 'image/png');
  const signedUrl = await getLayerSignedUrl(storagePath);
  return { storagePath, signedUrl };
}

/** Create a 7-day signed URL for a layer in the compositions bucket. */
export async function getLayerSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.COMPOSITIONS)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to sign layer URL (${storagePath}): ${error?.message ?? 'unknown'}`);
  }
  return data.signedUrl;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/** INSERT a row into asset_packs, return its id. Status defaults to 'generating'. */
export async function createAssetPackRow(args: {
  postId:         string;
  projectId:      string;
  generationPath: GenerationPath;
}): Promise<string> {
  const res = await query(
    `INSERT INTO asset_packs (post_id, project_id, status, generation_path)
     VALUES ($1, $2, 'generating', $3)
     RETURNING id`,
    [args.postId, args.projectId, args.generationPath],
  );
  return res.rows[0].id as string;
}

/** UPDATE asset_packs.status (and optionally style_card) and bump updated_at. */
export async function updatePackStatus(
  packId:    string,
  status:    PackStatus,
  styleCard: StyleCard | null = null,
): Promise<void> {
  if (styleCard) {
    await query(
      `UPDATE asset_packs
          SET status = $1, style_card = $2::jsonb, updated_at = NOW()
        WHERE id = $3`,
      [status, JSON.stringify(styleCard), packId],
    );
  } else {
    await query(
      `UPDATE asset_packs SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, packId],
    );
  }
}

/** Point a post at its newly-built (or currently-active) pack. */
export async function setActiveAssetPack(postId: string, packId: string): Promise<void> {
  await query(
    `UPDATE posts SET active_asset_pack_id = $1, updated_at = NOW() WHERE id = $2`,
    [packId, postId],
  );
}

/** INSERT a row into images for one layer of an asset pack. Returns image id. */
export async function insertLayerImage(args: {
  packId:      string;
  projectId:   string;
  layerType:   LayerType;
  storagePath: string;
  publicUrl:   string;     // we store the unsigned URL; routes re-sign on read
  filename?:   string;
}): Promise<string> {
  const filename = args.filename ?? `${args.layerType}.png`;
  const res = await query(
    `INSERT INTO images
       (project_id, image_type, enhanced_url, s3_key, s3_bucket,
        filename, mime_type, metadata, asset_pack_id, layer_type)
     VALUES ($1, 'enhanced', $2, $3, $4, $5, 'image/png', $6, $7, $8)
     RETURNING id`,
    [
      args.projectId,
      args.publicUrl,
      args.storagePath,
      STORAGE_BUCKETS.COMPOSITIONS,
      filename,
      JSON.stringify({
        provider:     'google',
        layer_type:   args.layerType,
      }),
      args.packId,
      args.layerType,
    ],
  );
  return res.rows[0].id as string;
}
