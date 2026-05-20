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
import { STORAGE_BUCKETS, uploadBuffer, getPublicUrl } from '@/lib/storage-utils';
import {
  buildBrandPromptSection,
  type BrandDNA,
  type ProjectBrandGuidelines,
} from '@/lib/brand';
import { buildStyleCard, type StyleCard }  from '@/lib/style-card';
import {
  createImageWithGoogle,
  generateFromRender,
  generateBackgroundLayer,
  generateEnvironmentLayer,
  generateFeaturedLayer,
  generateOrnamentsLayer,
  generatePeopleLayer,
} from '@/lib/google-image';
import { getBuildingLayer, removeBackground } from '@/lib/bria';
import { decomposeIntoLayers }                from '@/lib/qwen-layered';

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
  packId:              string;
  projectId:           string;
  layerType:           LayerType;
  storagePath:         string;
  publicUrl:           string;     // we store the unsigned URL; routes re-sign on read
  transparencyApplied: boolean;    // persisted in metadata so /asset-pack GET reads it back
  filename?:           string;
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
        provider:             'google',
        layer_type:           args.layerType,
        transparency_applied: args.transparencyApplied,
      }),
      args.packId,
      args.layerType,
    ],
  );
  return res.rows[0].id as string;
}

// ── Prompt construction (shared by per-layer + hybrid orchestrators) ──────────

const FORMATO_NOTES: Record<string, string> = {
  'Reel':     'Vertical video-cover format. Bold single visual, strong focal point, minimal scene complexity.',
  'Carrusel': 'First slide of a carousel. Composition must work as standalone and invite swiping right.',
  'Story':    'Ephemeral story format. Full-bleed vertical, bold visual impact, immediate read.',
  'Post':     'Standard portrait feed post. Balanced composition with breathing room.',
};

/**
 * Build the brand + project + post prompt fragment. Each layer generator
 * adds its own framing on top of this (so we deliberately skip the
 * "Ultra-realistic photorealistic..." preamble used by the legacy generate
 * route — layer FRAMING strings already cover composition + dimensions).
 */
function buildPackPrompt(ctx: BuildContext): string {
  const parts: string[] = [];

  const brandSection = buildBrandPromptSection(ctx.brand, ctx.projectBrand);
  if (brandSection) parts.push(brandSection);

  if (ctx.post.formato && FORMATO_NOTES[ctx.post.formato])
    parts.push(`Format: ${FORMATO_NOTES[ctx.post.formato]}`);

  if (ctx.post.idea)          parts.push(`Concept: ${ctx.post.idea}.`);
  if (ctx.post.descripcion)   parts.push(`Brief: ${ctx.post.descripcion}.`);
  if (ctx.post.texto_en_arte) parts.push(`Display text (reference only, do not render): "${ctx.post.texto_en_arte}".`);

  return parts.join(' ');
}

// ── Reference image downloads ─────────────────────────────────────────────────

async function downloadUploadsBuffer(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.UPLOADS)
    .download(storagePath);
  if (error) throw new Error(`Storage download failed (${storagePath}): ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

// ── Per-layer job runner — catches individual layer failures ──────────────────

interface LayerJobResult {
  layerType:           LayerType;
  buffer:              Buffer | null;     // null when generation failed
  transparencyApplied: boolean;
  error:               string | null;
}

async function runLayerJob(
  layerType: LayerType,
  factory:   () => Promise<{ buffer: Buffer; transparencyApplied: boolean }>,
): Promise<LayerJobResult> {
  try {
    const r = await factory();
    return { layerType, buffer: r.buffer, transparencyApplied: r.transparencyApplied, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[asset-pack] layer "${layerType}" failed:`, msg);
    return { layerType, buffer: null, transparencyApplied: false, error: msg };
  }
}

// ============================================================================
// PER-LAYER ORCHESTRATOR
// Generates all 7 layers independently (background, building, environment,
// featured, ornaments, people, composite). Each is its own promise — one
// layer's failure does not kill the rest of the pack. Pack ends up with
// status 'ready' (all succeeded), 'partial' (some failed), or 'failed' (all).
// ============================================================================

export async function createAssetPackPerLayer(ctx: BuildContext): Promise<AssetPackResult> {
  const packId = await createAssetPackRow({
    postId:         ctx.postId,
    projectId:      ctx.projectId,
    generationPath: 'per-layer',
  });

  try {
    // 1. Download all reference buffers once, share across layer calls.
    const [pinterestBuffers, styleBuffers, renderBuffer] = await Promise.all([
      Promise.all(ctx.pinterestPaths.map(downloadUploadsBuffer)),
      Promise.all(ctx.styleRefPaths.map(downloadUploadsBuffer)),
      ctx.pinnedRenderPath
        ? downloadUploadsBuffer(ctx.pinnedRenderPath)
        : Promise.resolve<Buffer | null>(null),
    ]);

    const styleRefs      = [...pinterestBuffers, ...styleBuffers];
    const pinterestCount = pinterestBuffers.length;
    const basePrompt     = buildPackPrompt(ctx);

    const baseUsage = {
      route:        '/api/posts/[id]/asset-pack',
      postId:       ctx.postId,
      projectId:    ctx.projectId,
      assetPackId:  packId,
    };

    // 2. Generate all layers in parallel. Each runLayerJob isolates its own failure.
    const jobs: Promise<LayerJobResult>[] = [
      runLayerJob('background', async () => {
        const buf = await generateBackgroundLayer(basePrompt, baseUsage);
        return { buffer: buf, transparencyApplied: false };
      }),

      runLayerJob('environment', async () => {
        const buf = await generateEnvironmentLayer(basePrompt, styleRefs, baseUsage);
        return removeBackground(buf, { ...baseUsage, layerType: 'environment' });
      }),

      runLayerJob('featured', async () => {
        const buf = await generateFeaturedLayer(basePrompt, styleRefs, baseUsage);
        return removeBackground(buf, { ...baseUsage, layerType: 'featured' });
      }),

      runLayerJob('ornaments', async () => {
        const buf = await generateOrnamentsLayer(basePrompt, styleRefs, baseUsage);
        return removeBackground(buf, { ...baseUsage, layerType: 'ornaments' });
      }),

      runLayerJob('people', async () => {
        const buf = await generatePeopleLayer(basePrompt, styleRefs, baseUsage);
        return removeBackground(buf, { ...baseUsage, layerType: 'people' });
      }),

      runLayerJob('composite', async () => {
        const buf = renderBuffer
          ? await generateFromRender(renderBuffer, basePrompt, styleRefs, pinterestCount, { ...baseUsage, layerType: 'composite' })
          : await createImageWithGoogle(basePrompt, undefined, { ...baseUsage, layerType: 'composite' });
        return { buffer: buf, transparencyApplied: false };
      }),
    ];

    if (renderBuffer) {
      jobs.push(
        runLayerJob('building', async () => getBuildingLayer(renderBuffer, baseUsage)),
      );
    }

    const jobResults = await Promise.all(jobs);

    // 3. Upload + persist each successful layer.
    const layers: LayerResult[] = [];
    let failedCount = 0;

    for (const r of jobResults) {
      if (!r.buffer) { failedCount++; continue; }

      const { storagePath, signedUrl } = await uploadLayer(packId, r.layerType, r.buffer);
      const publicUrl = getPublicUrl(STORAGE_BUCKETS.COMPOSITIONS, storagePath);
      const imageId   = await insertLayerImage({
        packId,
        projectId:           ctx.projectId,
        layerType:           r.layerType,
        storagePath,
        publicUrl,
        transparencyApplied: r.transparencyApplied,
      });

      layers.push({
        layerType:           r.layerType,
        imageId,
        storagePath,
        signedUrl,
        transparencyApplied: r.transparencyApplied,
      });
    }

    // 4. Build style card and finalize pack.
    const styleCard = buildStyleCard(
      ctx.brand,
      ctx.projectBrand,
      ctx.pinterestUrls.map((url) => ({ url })),
    );

    const status: PackStatus =
      failedCount === 0                  ? 'ready'   :
      failedCount === jobResults.length  ? 'failed'  :
                                           'partial';

    await updatePackStatus(packId, status, styleCard);
    if (status !== 'failed') {
      await setActiveAssetPack(ctx.postId, packId);
    }

    return {
      assetPackId:    packId,
      postId:         ctx.postId,
      projectId:      ctx.projectId,
      status,
      generationPath: 'per-layer',
      layers,
      styleCard,
    };
  } catch (err) {
    await updatePackStatus(packId, 'failed').catch(() => {});
    throw err;
  }
}

// ============================================================================
// PER-LAYER REGENERATION
// Regenerates ONE layer of an existing pack in place. Used by D3
// (POST /api/posts/[id]/asset-pack/layers/[type]) when the designer clicks
// "Regenerar esta capa" on a single tab.
//
// Storage path is reused (canonical asset-packs/{packId}/{layerType}.png) so
// the file URL stays stable. The previous images row for this layer-in-pack
// is deleted and a fresh one is inserted — no per-layer version history
// (pack-level history exists via parent_pack_id when the user generates a
// brand new pack).
//
// Caller is responsible for loading the same BuildContext that built the
// original pack; this function does not re-fetch from the DB.
// ============================================================================

export async function regenerateLayer(
  packId:            string,
  ctx:               BuildContext,
  layerType:         LayerType,
  refinementPrompt?: string,
): Promise<LayerResult> {
  // 1. Download references in parallel (same set used by the orchestrators).
  const [pinterestBuffers, styleBuffers, renderBuffer] = await Promise.all([
    Promise.all(ctx.pinterestPaths.map(downloadUploadsBuffer)),
    Promise.all(ctx.styleRefPaths.map(downloadUploadsBuffer)),
    ctx.pinnedRenderPath
      ? downloadUploadsBuffer(ctx.pinnedRenderPath)
      : Promise.resolve<Buffer | null>(null),
  ]);

  const styleRefs      = [...pinterestBuffers, ...styleBuffers];
  const pinterestCount = pinterestBuffers.length;

  const basePrompt = buildPackPrompt(ctx);
  const prompt     = refinementPrompt?.trim()
    ? `${basePrompt} Additional direction for this regeneration: ${refinementPrompt.trim()}`
    : basePrompt;

  const baseUsage = {
    route:        '/api/posts/[id]/asset-pack/layers/[type]',
    postId:       ctx.postId,
    projectId:    ctx.projectId,
    assetPackId:  packId,
    layerType,
  };

  // 2. Generate the single layer based on its type.
  let buffer:              Buffer;
  let transparencyApplied: boolean;

  switch (layerType) {
    case 'background': {
      buffer = await generateBackgroundLayer(prompt, baseUsage);
      transparencyApplied = false;
      break;
    }
    case 'building': {
      if (!renderBuffer) throw new Error('No pinned render — cannot regenerate building layer');
      const r = await getBuildingLayer(renderBuffer, baseUsage);
      buffer = r.buffer;
      transparencyApplied = r.transparencyApplied;
      break;
    }
    case 'environment': {
      const gen = await generateEnvironmentLayer(prompt, styleRefs, baseUsage);
      const r   = await removeBackground(gen, baseUsage);
      buffer = r.buffer;
      transparencyApplied = r.transparencyApplied;
      break;
    }
    case 'featured': {
      const gen = await generateFeaturedLayer(prompt, styleRefs, baseUsage);
      const r   = await removeBackground(gen, baseUsage);
      buffer = r.buffer;
      transparencyApplied = r.transparencyApplied;
      break;
    }
    case 'ornaments': {
      const gen = await generateOrnamentsLayer(prompt, styleRefs, baseUsage);
      const r   = await removeBackground(gen, baseUsage);
      buffer = r.buffer;
      transparencyApplied = r.transparencyApplied;
      break;
    }
    case 'people': {
      const gen = await generatePeopleLayer(prompt, styleRefs, baseUsage);
      const r   = await removeBackground(gen, baseUsage);
      buffer = r.buffer;
      transparencyApplied = r.transparencyApplied;
      break;
    }
    case 'composite': {
      buffer = renderBuffer
        ? await generateFromRender(renderBuffer, prompt, styleRefs, pinterestCount, baseUsage)
        : await createImageWithGoogle(prompt, undefined, baseUsage);
      transparencyApplied = false;
      break;
    }
  }

  // 3. Upload to canonical path (overwrites previous file at the same key).
  await uploadBuffer(
    STORAGE_BUCKETS.COMPOSITIONS,
    buildLayerStoragePath(packId, layerType),
    buffer,
    'image/png',
  );
  const storagePath = buildLayerStoragePath(packId, layerType);
  const publicUrl   = getPublicUrl(STORAGE_BUCKETS.COMPOSITIONS, storagePath);
  const signedUrl   = await getLayerSignedUrl(storagePath);

  // 4. Swap the images row: delete previous, insert fresh.
  await query(
    `DELETE FROM images WHERE asset_pack_id = $1 AND layer_type = $2`,
    [packId, layerType],
  );
  const imageId = await insertLayerImage({
    packId,
    projectId: ctx.projectId,
    layerType,
    storagePath,
    publicUrl,
    transparencyApplied,
  });

  // 5. Bump the pack's updated_at so the UI knows something changed.
  await query(`UPDATE asset_packs SET updated_at = NOW() WHERE id = $1`, [packId]);

  return { layerType, imageId, storagePath, signedUrl, transparencyApplied };
}

// ============================================================================
// HYBRID ORCHESTRATOR
// Cost-optimized path: one Gemini render-anchored composition → Qwen-Image-
// Layered decomposition → up to 5 semantic layers + dedicated building layer
// from the pinned render + the composition itself as preview.
//
// Two automatic fallbacks:
//   - No pinned render → hybrid has no structural anchor → call per-layer.
//   - Qwen decomposition unavailable / failed → mark this hybrid attempt
//     'failed' (debug trail) and call per-layer.
//
// Layer mapping is heuristic: Qwen returns RGBA layers in roughly back-to-
// front order. We assume index 0 = background, 1 = environment, etc. The
// mapping is imperfect — the designer can regenerate any layer via the
// per-layer route (D3) if Qwen's split disagrees with the semantic intent.
// Building is always sourced from the pinned render (highest fidelity),
// never from Qwen's "building"-ish layer.
// ============================================================================

/** Qwen output index → our semantic layer type. Order assumes back-to-front. */
const QWEN_INDEX_TO_LAYER: readonly LayerType[] = [
  'background',   // 0 — back-most plate
  'environment',  // 1 — vegetation, ground
  'people',       // 2 — figures (if present)
  'ornaments',    // 3 — small accents
  'featured',     // 4 — highlighted element
] as const;

export async function createAssetPackHybrid(ctx: BuildContext): Promise<AssetPackResult> {
  // Without a pinned render, hybrid has no anchor — go directly to per-layer.
  if (!ctx.pinnedRenderPath) {
    return createAssetPackPerLayer(ctx);
  }

  const packId = await createAssetPackRow({
    postId:         ctx.postId,
    projectId:      ctx.projectId,
    generationPath: 'hybrid',
  });

  try {
    // 1. Download references in parallel.
    const [pinterestBuffers, styleBuffers, renderBuffer] = await Promise.all([
      Promise.all(ctx.pinterestPaths.map(downloadUploadsBuffer)),
      Promise.all(ctx.styleRefPaths.map(downloadUploadsBuffer)),
      downloadUploadsBuffer(ctx.pinnedRenderPath),
    ]);

    const styleRefs      = [...pinterestBuffers, ...styleBuffers];
    const pinterestCount = pinterestBuffers.length;
    const basePrompt     = buildPackPrompt(ctx);

    const baseUsage = {
      route:        '/api/posts/[id]/asset-pack',
      postId:       ctx.postId,
      projectId:    ctx.projectId,
      assetPackId:  packId,
    };

    // 2. Generate the composite via the render-anchored pipeline.
    const compositeBuffer = await generateFromRender(
      renderBuffer,
      basePrompt,
      styleRefs,
      pinterestCount,
      { ...baseUsage, layerType: 'composite' },
    );

    // 3. Decompose composite via Qwen. Returns null when FAL is unavailable
    //    or the call fails — both cases fall through to per-layer.
    const decomposed = await decomposeIntoLayers(
      compositeBuffer,
      QWEN_INDEX_TO_LAYER.length,
      { ...baseUsage, layerType: 'composite' },
    );

    if (!decomposed) {
      // Hybrid path didn't land. Mark this attempt failed, let per-layer take over.
      // (per-layer creates its own pack row and points the post at it.)
      await updatePackStatus(packId, 'failed');
      return createAssetPackPerLayer(ctx);
    }

    // 4. Building always comes from the pinned render through Bria — highest fidelity.
    const buildingResult = await getBuildingLayer(renderBuffer, baseUsage);

    // 5. Upload + persist every layer.
    const layers: LayerResult[] = [];

    const persist = async (
      layerType:           LayerType,
      buffer:              Buffer,
      transparencyApplied: boolean,
    ) => {
      const { storagePath, signedUrl } = await uploadLayer(packId, layerType, buffer);
      const publicUrl = getPublicUrl(STORAGE_BUCKETS.COMPOSITIONS, storagePath);
      const imageId   = await insertLayerImage({
        packId,
        projectId:           ctx.projectId,
        layerType,
        storagePath,
        publicUrl,
        transparencyApplied,
      });
      layers.push({ layerType, imageId, storagePath, signedUrl, transparencyApplied });
    };

    await persist('building', buildingResult.buffer, buildingResult.transparencyApplied);

    for (let i = 0; i < decomposed.length && i < QWEN_INDEX_TO_LAYER.length; i++) {
      const layerType = QWEN_INDEX_TO_LAYER[i];
      await persist(layerType, decomposed[i].buffer, true /* qwen output is RGBA */);
    }

    await persist('composite', compositeBuffer, false);

    // 6. Build style card and finalize.
    const styleCard = buildStyleCard(
      ctx.brand,
      ctx.projectBrand,
      ctx.pinterestUrls.map((url) => ({ url })),
    );

    // Hybrid is "ready" as long as we have the composite + building + at least one
    // decomposed layer. Anything less and we'd have called per-layer already.
    await updatePackStatus(packId, 'ready', styleCard);
    await setActiveAssetPack(ctx.postId, packId);

    return {
      assetPackId:    packId,
      postId:         ctx.postId,
      projectId:      ctx.projectId,
      status:         'ready',
      generationPath: 'hybrid',
      layers,
      styleCard,
    };
  } catch (err) {
    await updatePackStatus(packId, 'failed').catch(() => {});
    throw err;
  }
}
