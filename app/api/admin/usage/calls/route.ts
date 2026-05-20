/**
 * GET /api/admin/usage/calls?page=N — operator-only paginated list of API calls.
 *
 * 20 rows per page, most recent first. Joins projects for the project name
 * so the UI doesn't need a second lookup. Returns { page, limit, total, calls }
 * so the frontend can render "Page 1 of 42" + Prev/Next controls.
 *
 * Gated by requireSuperuser() — same as the aggregations endpoint.
 */

import { NextResponse }      from 'next/server';
import { query }             from '@/lib/db';
import { requireSuperuser }  from '@/lib/superuser';

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  const denied = await requireSuperuser();
  if (denied) return denied;

  try {
    const url     = new URL(request.url);
    const pageRaw = parseInt(url.searchParams.get('page') ?? '1', 10);
    const page    = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const offset  = (page - 1) * PAGE_SIZE;

    const [countRes, rowsRes] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total FROM api_usage_logs`),
      query(
        `SELECT u.id, u.created_at, u.route, u.provider, u.model, u.operation,
                u.input_tokens, u.output_tokens, u.image_count, u.cost_usd, u.latency_ms,
                u.user_email, u.post_id, u.project_id, u.asset_pack_id, u.layer_type,
                u.success, u.error_message,
                p.project_name
           FROM api_usage_logs u
           LEFT JOIN projects p ON p.id = u.project_id
          ORDER BY u.created_at DESC
          LIMIT $1 OFFSET $2`,
        [PAGE_SIZE, offset],
      ),
    ]);

    const total = countRes.rows[0]?.total ?? 0;

    interface CallRow {
      id:             string;
      created_at:     string;
      route:          string | null;
      provider:       string;
      model:          string;
      operation:      string;
      input_tokens:   number | null;
      output_tokens:  number | null;
      image_count:    number;
      cost_usd:       string | number | null;
      latency_ms:     number;
      user_email:     string | null;
      post_id:        string | null;
      project_id:     string | null;
      project_name:   string | null;
      asset_pack_id:  string | null;
      layer_type:     string | null;
      success:        boolean;
      error_message:  string | null;
    }

    return NextResponse.json({
      page,
      limit:  PAGE_SIZE,
      total,
      calls: (rowsRes.rows as CallRow[]).map((r) => ({
        id:            r.id,
        createdAt:     r.created_at,
        route:         r.route,
        provider:      r.provider,
        model:         r.model,
        operation:     r.operation,
        inputTokens:   r.input_tokens,
        outputTokens:  r.output_tokens,
        imageCount:    r.image_count,
        costUsd:       r.cost_usd != null ? Number(r.cost_usd) : null,
        latencyMs:     r.latency_ms,
        userEmail:     r.user_email,
        postId:        r.post_id,
        projectId:     r.project_id,
        projectName:   r.project_name,
        assetPackId:   r.asset_pack_id,
        layerType:     r.layer_type,
        success:       r.success,
        errorMessage:  r.error_message,
      })),
    });
  } catch (err) {
    console.error('[admin/usage/calls] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load calls' },
      { status: 500 },
    );
  }
}
