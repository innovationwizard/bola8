/**
 * POST /api/posts/[id]/asset-pack/layers/[type]/upload-url
 *
 * Returns a signed upload URL pointing at the canonical layer path
 * `asset-packs/{packId}/{layerType}.png` inside the compositions bucket. The
 * client PUTs the file directly to Supabase (bypassing Vercel's 4.5 MB body
 * limit), then calls PUT on the layer route to register the swap.
 *
 * Auth handled upstream by middleware.ts.
 */

import { NextResponse }      from 'next/server';
import { query }             from '@/lib/db';
import { supabase }          from '@/lib/supabase';
import { STORAGE_BUCKETS }   from '@/lib/storage-utils';
import { buildLayerStoragePath, type LayerType } from '@/lib/asset-pack-builder';

const VALID_LAYER_TYPES: ReadonlySet<LayerType> = new Set<LayerType>([
  'background',
  'building',
  'environment',
  'featured',
  'ornaments',
  'people',
  'composite',
]);

export async function POST(
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
      `SELECT active_asset_pack_id FROM posts WHERE id = $1`,
      [postId],
    );
    if (postLookup.rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    const packId = postLookup.rows[0].active_asset_pack_id as string | null;
    if (!packId) {
      return NextResponse.json(
        { error: 'No active asset pack — generate the pack first.' },
        { status: 409 },
      );
    }

    const path = buildLayerStoragePath(packId, layerType);

    // upsert=true so the client can overwrite the canonical layer file.
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.COMPOSITIONS)
      .createSignedUploadUrl(path, { upsert: true });

    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? 'Failed to create signed upload URL');
    }

    return NextResponse.json({ signedUrl: data.signedUrl, path, packId });
  } catch (err) {
    console.error('[asset-pack/layer/upload-url] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to mint upload URL' },
      { status: 500 },
    );
  }
}
