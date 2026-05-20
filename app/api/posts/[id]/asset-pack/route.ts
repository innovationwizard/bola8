/**
 * POST /api/posts/[id]/asset-pack — build a new layered asset pack for a post.
 *
 * Thin handler:
 *   1. Load the post + project brand + client brand DNA.
 *   2. Load pinned render, post Pinterest Inspo, project style refs (and sign
 *      Pinterest URLs for the style card sidebar).
 *   3. Hand off to createAssetPackHybrid (default) — which silently falls back
 *      to per-layer when FAL_API_KEY is missing or Qwen fails.
 *
 * Costs are logged inside the orchestrators via withUsageLogging.
 * No cost UI is returned to the client (operator-only visibility).
 */

import { NextResponse }      from 'next/server';
import { query }             from '@/lib/db';
import { supabase }          from '@/lib/supabase';
import { STORAGE_BUCKETS }   from '@/lib/storage-utils';
import { MAX_STYLE_REFS }    from '@/lib/google-image';
import {
  createAssetPackHybrid,
  getLayerSignedUrl,
  type BuildContext,
  type LayerType,
  type LayerResult,
  type PackStatus,
  type GenerationPath,
} from '@/lib/asset-pack-builder';
import type { StyleCard }    from '@/lib/style-card';
import type { BrandDNA, ProjectBrandGuidelines } from '@/lib/brand';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h — only used for the style-card sidebar.

async function signUploadsUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.UPLOADS)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.warn(`[asset-pack] failed to sign Pinterest URL (${storagePath}):`, error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // ── Load post + brand context ────────────────────────────────────────────
    const postRes = await query(
      `SELECT p.id, p.project_id, p.idea, p.descripcion, p.texto_en_arte, p.formato,
              pr.brand_guidelines,
              c.brand_dna
         FROM posts p
         JOIN projects pr ON pr.id = p.project_id
         LEFT JOIN clients c ON c.id = pr.client_id
        WHERE p.id = $1`,
      [id],
    );
    if (postRes.rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const row          = postRes.rows[0];
    const brand        = (row.brand_dna        ?? null) as BrandDNA | null;
    const projectBrand = (row.brand_guidelines ?? null) as ProjectBrandGuidelines | null;

    // ── Load reference image paths in parallel ───────────────────────────────
    const [pinnedRenderRes, pinterestRes, styleRefRes] = await Promise.all([
      query(
        `SELECT storage_path FROM project_reference_images
          WHERE project_id = $1 AND role = 'render' AND is_pinned = TRUE
          LIMIT 1`,
        [row.project_id],
      ),
      query(
        `SELECT storage_path FROM post_reference_images
          WHERE post_id = $1
          ORDER BY display_order ASC, created_at ASC
          LIMIT $2`,
        [id, MAX_STYLE_REFS],
      ),
      query(
        `SELECT storage_path FROM project_reference_images
          WHERE project_id = $1 AND role = 'style'
          ORDER BY display_order ASC, created_at ASC
          LIMIT $2`,
        [row.project_id, MAX_STYLE_REFS],
      ),
    ]);

    const pinnedRenderPath = (pinnedRenderRes.rows[0]?.storage_path ?? null) as string | null;
    const pinterestPaths   = pinterestRes.rows.map((r: { storage_path: string }) => r.storage_path);
    const styleRefPaths    = styleRefRes.rows.map((r: { storage_path: string }) => r.storage_path);

    // Sign Pinterest URLs for the style-card sidebar (best-effort).
    const pinterestUrls = (
      await Promise.all(pinterestPaths.map(signUploadsUrl))
    ).filter((u): u is string => !!u);

    // ── Build context + orchestrate ──────────────────────────────────────────
    const buildContext: BuildContext = {
      postId:    id,
      projectId: row.project_id,
      post: {
        idea:          row.idea          ?? null,
        descripcion:   row.descripcion   ?? null,
        texto_en_arte: row.texto_en_arte ?? null,
        formato:       row.formato       ?? null,
      },
      brand,
      projectBrand,
      pinnedRenderPath,
      pinterestPaths,
      styleRefPaths,
      pinterestUrls,
    };

    const result = await createAssetPackHybrid(buildContext);

    return NextResponse.json(result);
  } catch (err) {
    console.error('[asset-pack] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Asset pack generation failed' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/posts/[id]/asset-pack — fetch the active pack for this post with
 * signed URLs per layer. Returns { assetPackId: null } (200) when the post
 * has no active pack yet, so the UI can render a clean empty state without
 * dealing with a 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // 1. Resolve the active pack id from the post.
    const postRes = await query(
      `SELECT active_asset_pack_id FROM posts WHERE id = $1`,
      [id],
    );
    if (postRes.rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    const packId = postRes.rows[0].active_asset_pack_id as string | null;
    if (!packId) {
      return NextResponse.json({ assetPackId: null });
    }

    // 2. Load pack + layers in parallel.
    const [packRes, layersRes] = await Promise.all([
      query(
        `SELECT id, post_id, project_id, status, generation_path, style_card, created_at, updated_at
           FROM asset_packs WHERE id = $1`,
        [packId],
      ),
      query(
        `SELECT id, layer_type, s3_key, metadata
           FROM images
          WHERE asset_pack_id = $1
            AND layer_type IS NOT NULL`,
        [packId],
      ),
    ]);

    if (packRes.rows.length === 0) {
      // Pack id is set on the post but the row is gone. Clean state for the UI.
      return NextResponse.json({ assetPackId: null });
    }
    const pack = packRes.rows[0];

    // 3. Sign each layer's URL and read transparency flag from metadata.
    type LayerRow = {
      id:         string;
      layer_type: LayerType;
      s3_key:     string;
      metadata:   { transparency_applied?: boolean } | null;
    };
    const layers: LayerResult[] = await Promise.all(
      (layersRes.rows as LayerRow[])
        .filter((r) => !!r.s3_key)
        .map(async (r) => ({
          layerType:           r.layer_type,
          imageId:             r.id,
          storagePath:         r.s3_key,
          signedUrl:           await getLayerSignedUrl(r.s3_key),
          transparencyApplied: r.metadata?.transparency_applied === true,
        })),
    );

    return NextResponse.json({
      assetPackId:    pack.id as string,
      postId:         pack.post_id as string,
      projectId:      pack.project_id as string,
      status:         pack.status         as PackStatus,
      generationPath: pack.generation_path as GenerationPath,
      layers,
      styleCard:      (pack.style_card ?? null) as StyleCard | null,
      createdAt:      pack.created_at,
      updatedAt:      pack.updated_at,
    });
  } catch (err) {
    console.error('[asset-pack] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch asset pack' },
      { status: 500 },
    );
  }
}
