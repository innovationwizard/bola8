/**
 * POST /api/posts/[id]/asset-pack/layers/[type] — regenerate ONE layer of the
 * active asset pack for this post.
 *
 * Validates that [type] is one of the seven LayerType values, then loads the
 * same BuildContext that the parent pack route uses and hands off to
 * regenerateLayer() in lib/asset-pack-builder.ts. The previous layer file at
 * the canonical path is overwritten; the images row is swapped.
 *
 * Optional request body:
 *   { "refinementPrompt": "person should be a child playing, mid-stride" }
 *
 * Auth is enforced upstream by middleware.ts.
 */

import { NextResponse }    from 'next/server';
import { query }           from '@/lib/db';
import { supabase }        from '@/lib/supabase';
import { STORAGE_BUCKETS, getPublicUrl } from '@/lib/storage-utils';
import { MAX_STYLE_REFS }  from '@/lib/google-image';
import {
  regenerateLayer,
  buildLayerStoragePath,
  getLayerSignedUrl,
  getLayerDownloadUrl,
  insertLayerImage,
  type BuildContext,
  type LayerType,
  type LayerResult,
} from '@/lib/asset-pack-builder';
import type { BrandDNA, ProjectBrandGuidelines } from '@/lib/brand';

const VALID_LAYER_TYPES: ReadonlySet<LayerType> = new Set<LayerType>([
  'background',
  'building',
  'environment',
  'featured',
  'ornaments',
  'people',
  'composite',
]);

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h — only for the style-card sidebar URLs.

async function signUploadsUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.UPLOADS)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.warn(`[asset-pack/layer] failed to sign URL (${storagePath}):`, error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  try {
    const { id: postId, type } = await params;

    // ── Validate layer type ──────────────────────────────────────────────────
    if (!VALID_LAYER_TYPES.has(type as LayerType)) {
      return NextResponse.json(
        { error: `Invalid layer type "${type}". Expected one of: ${[...VALID_LAYER_TYPES].join(', ')}` },
        { status: 400 },
      );
    }
    const layerType = type as LayerType;

    // ── Parse optional body ──────────────────────────────────────────────────
    let refinementPrompt: string | undefined;
    try {
      const body = await request.json().catch(() => ({}));
      if (typeof body?.refinementPrompt === 'string') {
        refinementPrompt = body.refinementPrompt;
      }
    } catch { /* body optional */ }

    // ── Resolve active pack id ───────────────────────────────────────────────
    const postLookup = await query(
      `SELECT active_asset_pack_id FROM posts WHERE id = $1`,
      [postId],
    );
    if (postLookup.rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    const packId = postLookup.rows[0].active_asset_pack_id as string | null;
    if (!packId) {
      return NextResponse.json(
        { error: 'No active asset pack for this post — generate the pack first.' },
        { status: 409 },
      );
    }

    // ── Load BuildContext (mirrors POST /asset-pack) ─────────────────────────
    const postRes = await query(
      `SELECT p.id, p.project_id, p.idea, p.descripcion, p.texto_en_arte, p.formato,
              pr.brand_guidelines,
              c.brand_dna
         FROM posts p
         JOIN projects pr ON pr.id = p.project_id
         LEFT JOIN clients c ON c.id = pr.client_id
        WHERE p.id = $1`,
      [postId],
    );
    if (postRes.rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    const row          = postRes.rows[0];
    const brand        = (row.brand_dna        ?? null) as BrandDNA | null;
    const projectBrand = (row.brand_guidelines ?? null) as ProjectBrandGuidelines | null;

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
        [postId, MAX_STYLE_REFS],
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
    const pinterestUrls    = (
      await Promise.all(pinterestPaths.map(signUploadsUrl))
    ).filter((u): u is string => !!u);

    const buildContext: BuildContext = {
      postId,
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

    // ── Regenerate the single layer ──────────────────────────────────────────
    const result = await regenerateLayer(packId, buildContext, layerType, refinementPrompt);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[asset-pack/layer] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Layer regeneration failed' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/posts/[id]/asset-pack/layers/[type] — register a user-uploaded layer.
 *
 * The client has already PUT the file directly to the canonical Supabase
 * storage path via the signed URL minted by upload-url/route.ts. This handler
 * does the metadata swap only:
 *   - Validates layer type, looks up the active pack, verifies the file
 *     actually landed in storage.
 *   - Deletes the previous images row for this (pack, layer) and inserts a
 *     fresh one (transparency_applied defaults to true — user-uploaded PNGs
 *     are presumed intentional about alpha).
 *   - Bumps asset_packs.updated_at.
 *   - Returns the same LayerResult shape that POST returns.
 */
export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  try {
    const { id: postId, type } = await params;

    if (!VALID_LAYER_TYPES.has(type as LayerType)) {
      return NextResponse.json({ error: `Invalid layer type "${type}"` }, { status: 400 });
    }
    const layerType = type as LayerType;

    const postLookup = await query(
      `SELECT active_asset_pack_id, p.project_id
         FROM posts p
        WHERE p.id = $1`,
      [postId],
    );
    if (postLookup.rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    const packId    = postLookup.rows[0].active_asset_pack_id as string | null;
    const projectId = postLookup.rows[0].project_id            as string;
    if (!packId) {
      return NextResponse.json(
        { error: 'No active asset pack — generate the pack first.' },
        { status: 409 },
      );
    }

    const storagePath = buildLayerStoragePath(packId, layerType);

    // Verify the file actually exists in storage before we touch the DB.
    const folder = storagePath.split('/').slice(0, -1).join('/');
    const filename = storagePath.split('/').pop()!;
    const { data: listed, error: listError } = await supabase.storage
      .from(STORAGE_BUCKETS.COMPOSITIONS)
      .list(folder, { search: filename });
    if (listError) throw new Error(`Storage check failed: ${listError.message}`);
    const exists = (listed ?? []).some((f) => f.name === filename);
    if (!exists) {
      return NextResponse.json(
        { error: 'No se encontró el archivo subido. Vuelve a intentar la subida.' },
        { status: 409 },
      );
    }

    // Swap the images row.
    await query(
      `DELETE FROM images WHERE asset_pack_id = $1 AND layer_type = $2`,
      [packId, layerType],
    );
    const publicUrl = getPublicUrl(STORAGE_BUCKETS.COMPOSITIONS, storagePath);
    const imageId   = await insertLayerImage({
      packId,
      projectId,
      layerType,
      storagePath,
      publicUrl,
      transparencyApplied: true,  // user-uploaded PNGs presumed intentional about alpha
    });

    await query(`UPDATE asset_packs SET updated_at = NOW() WHERE id = $1`, [packId]);

    const [signedUrl, downloadUrl] = await Promise.all([
      getLayerSignedUrl(storagePath),
      getLayerDownloadUrl(storagePath, layerType),
    ]);

    const result: LayerResult = {
      layerType,
      imageId,
      storagePath,
      signedUrl,
      downloadUrl,
      transparencyApplied: true,
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error('[asset-pack/layer] PUT error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Layer registration failed' },
      { status: 500 },
    );
  }
}
