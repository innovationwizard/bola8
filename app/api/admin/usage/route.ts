/**
 * GET /api/admin/usage — operator-only aggregations over api_usage_logs.
 *
 * Returns:
 *   - totals.{today, week, month, lifetime}              cost + call count
 *   - byProvider[]                                       calls + cost + avg latency
 *   - byModel[]   (last 30 days)                         calls + cost + avg latency + success rate
 *   - topProjects[] (last 30 days, top 10 by cost)       project_id, project_name, cost, calls
 *   - fal.available                                      from process.env.FAL_API_KEY
 *
 * Gated by requireSuperuser() — both auth (middleware) and email allowlist
 * (SUPERUSER_EMAILS) must pass. End users never see this surface.
 */

import { NextResponse } from 'next/server';
import { query }        from '@/lib/db';
import { requireSuperuser } from '@/lib/superuser';
import { FAL_AVAILABLE }    from '@/lib/fal';

export async function GET() {
  const denied = await requireSuperuser();
  if (denied) return denied;

  try {
    const [
      totalsRes,
      byProviderRes,
      byModelRes,
      topProjectsRes,
    ] = await Promise.all([
      query(
        `SELECT
           COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours'), 0)  AS cost_today,
           COUNT(*)                FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')      AS calls_today,
           COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'),  0)    AS cost_week,
           COUNT(*)                FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')        AS calls_week,
           COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0)    AS cost_month,
           COUNT(*)                FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')       AS calls_month,
           COALESCE(SUM(cost_usd), 0)                                                            AS cost_lifetime,
           COUNT(*)                                                                              AS calls_lifetime
         FROM api_usage_logs`,
      ),
      query(
        `SELECT provider,
                COUNT(*)                  AS calls,
                COALESCE(SUM(cost_usd),0) AS cost,
                ROUND(AVG(latency_ms))    AS avg_latency_ms
           FROM api_usage_logs
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY provider
          ORDER BY cost DESC`,
      ),
      query(
        `SELECT model,
                provider,
                operation,
                COUNT(*)                                       AS calls,
                COALESCE(SUM(cost_usd),0)                      AS cost,
                ROUND(AVG(latency_ms))                         AS avg_latency_ms,
                ROUND(100.0 * AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END))::int AS success_rate_pct
           FROM api_usage_logs
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY model, provider, operation
          ORDER BY cost DESC`,
      ),
      query(
        `SELECT u.project_id,
                p.project_name,
                COUNT(*)                  AS calls,
                COALESCE(SUM(u.cost_usd),0) AS cost
           FROM api_usage_logs u
           LEFT JOIN projects p ON p.id = u.project_id
          WHERE u.created_at >= NOW() - INTERVAL '30 days'
            AND u.project_id IS NOT NULL
          GROUP BY u.project_id, p.project_name
          ORDER BY cost DESC
          LIMIT 10`,
      ),
    ]);

    const t = totalsRes.rows[0];

    return NextResponse.json({
      totals: {
        today:    { cost: Number(t.cost_today),    calls: Number(t.calls_today)    },
        week:     { cost: Number(t.cost_week),     calls: Number(t.calls_week)     },
        month:    { cost: Number(t.cost_month),    calls: Number(t.calls_month)    },
        lifetime: { cost: Number(t.cost_lifetime), calls: Number(t.calls_lifetime) },
      },
      byProvider: byProviderRes.rows.map((r: { provider: string; calls: string; cost: string; avg_latency_ms: string | null }) => ({
        provider:      r.provider,
        calls:         Number(r.calls),
        cost:          Number(r.cost),
        avgLatencyMs:  r.avg_latency_ms != null ? Number(r.avg_latency_ms) : null,
      })),
      byModel: byModelRes.rows.map((r: { model: string; provider: string; operation: string; calls: string; cost: string; avg_latency_ms: string | null; success_rate_pct: number | null }) => ({
        model:           r.model,
        provider:        r.provider,
        operation:       r.operation,
        calls:           Number(r.calls),
        cost:            Number(r.cost),
        avgLatencyMs:    r.avg_latency_ms != null ? Number(r.avg_latency_ms) : null,
        successRatePct:  r.success_rate_pct ?? null,
      })),
      topProjects: topProjectsRes.rows.map((r: { project_id: string; project_name: string | null; calls: string; cost: string }) => ({
        projectId:   r.project_id,
        projectName: r.project_name ?? '(sin nombre)',
        calls:       Number(r.calls),
        cost:        Number(r.cost),
      })),
      fal: {
        available: FAL_AVAILABLE,
      },
    });
  } catch (err) {
    console.error('[admin/usage] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load usage' },
      { status: 500 },
    );
  }
}
