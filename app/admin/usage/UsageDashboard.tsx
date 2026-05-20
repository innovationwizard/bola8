'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Loader2 } from 'lucide-react';

// ── Response types (match server shapes in /api/admin/usage + /calls) ─────────

interface TotalsBucket { cost: number; calls: number }
interface UsageSummary {
  totals:      { today: TotalsBucket; week: TotalsBucket; month: TotalsBucket; lifetime: TotalsBucket };
  byProvider:  { provider: string; calls: number; cost: number; avgLatencyMs: number | null }[];
  byModel:     { model: string; provider: string; operation: string; calls: number; cost: number; avgLatencyMs: number | null; successRatePct: number | null }[];
  topProjects: { projectId: string; projectName: string; calls: number; cost: number }[];
  fal:         { available: boolean };
}

interface CallRow {
  id:            string;
  createdAt:     string;
  route:         string | null;
  provider:      string;
  model:         string;
  operation:     string;
  inputTokens:   number | null;
  outputTokens:  number | null;
  imageCount:    number;
  costUsd:       number | null;
  latencyMs:     number;
  userEmail:     string | null;
  postId:        string | null;
  projectId:     string | null;
  projectName:   string | null;
  assetPackId:   string | null;
  layerType:     string | null;
  success:       boolean;
  errorMessage:  string | null;
}

interface CallsPage {
  page:  number;
  limit: number;
  total: number;
  calls: CallRow[];
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const formatLatency = (ms: number | null) => (ms == null ? '—' : `${ms.toLocaleString()} ms`);

// ──────────────────────────────────────────────────────────────────────────────

export default function UsageDashboard() {
  const [summary, setSummary]   = useState<UsageSummary | null>(null);
  const [calls, setCalls]       = useState<CallsPage   | null>(null);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const fetchAll = useCallback(async (pageArg: number) => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, callsRes] = await Promise.all([
        fetch('/api/admin/usage'),
        fetch(`/api/admin/usage/calls?page=${pageArg}`),
      ]);
      if (!sumRes.ok)   throw new Error(`Aggregations: ${sumRes.status}`);
      if (!callsRes.ok) throw new Error(`Calls: ${callsRes.status}`);
      setSummary(await sumRes.json());
      setCalls(await callsRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(page); }, [fetchAll, page]);

  const totalPages = calls ? Math.max(1, Math.ceil(calls.total / calls.limit)) : 1;
  const hasPrev    = page > 1;
  const hasNext    = page < totalPages;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-10">

        {/* Header */}
        <header className="flex items-start justify-between gap-6 border-b border-neutral-200 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-neutral-400">Operador</p>
            <h1 className="text-2xl font-light text-neutral-900 mt-1">Uso y costos</h1>
          </div>
          <div className="flex items-center gap-4">
            <FalIndicator available={summary?.fal.available ?? false} />
            <button
              onClick={() => fetchAll(page)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs border border-neutral-200 rounded-md hover:border-neutral-400 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refrescar
            </button>
          </div>
        </header>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {/* Totals — 4 cards */}
        <section>
          <h2 className="text-xs uppercase tracking-[0.15em] text-neutral-400 mb-3">Totales</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <TotalsCard label="Hoy"      bucket={summary?.totals.today} />
            <TotalsCard label="7 días"   bucket={summary?.totals.week} />
            <TotalsCard label="30 días"  bucket={summary?.totals.month} />
            <TotalsCard label="Lifetime" bucket={summary?.totals.lifetime} />
          </div>
        </section>

        {/* Provider breakdown */}
        <section>
          <h2 className="text-xs uppercase tracking-[0.15em] text-neutral-400 mb-3">Por proveedor (30 días)</h2>
          <DataTable
            columns={['Proveedor', 'Calls', 'Costo', 'Latencia prom.']}
            rows={
              (summary?.byProvider ?? []).map((r) => [
                r.provider,
                r.calls.toLocaleString(),
                usd(r.cost),
                formatLatency(r.avgLatencyMs),
              ])
            }
          />
        </section>

        {/* Top projects */}
        <section>
          <h2 className="text-xs uppercase tracking-[0.15em] text-neutral-400 mb-3">Top proyectos (30 días)</h2>
          <DataTable
            columns={['Proyecto', 'Calls', 'Costo']}
            rows={
              (summary?.topProjects ?? []).map((r) => [
                r.projectName,
                r.calls.toLocaleString(),
                usd(r.cost),
              ])
            }
          />
        </section>

        {/* By model */}
        <section>
          <h2 className="text-xs uppercase tracking-[0.15em] text-neutral-400 mb-3">Por modelo (30 días)</h2>
          <DataTable
            columns={['Modelo', 'Operación', 'Calls', 'Costo', 'Latencia prom.', '% éxito']}
            rows={
              (summary?.byModel ?? []).map((r) => [
                r.model,
                r.operation,
                r.calls.toLocaleString(),
                usd(r.cost),
                formatLatency(r.avgLatencyMs),
                r.successRatePct != null ? `${r.successRatePct}%` : '—',
              ])
            }
          />
        </section>

        {/* Recent calls (paginated) */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-[0.15em] text-neutral-400">Calls recientes</h2>
            <span className="text-xs text-neutral-500">
              Página {page} de {totalPages} — {calls?.total.toLocaleString() ?? 0} totales
            </span>
          </div>
          <div className="border border-neutral-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Hora</th>
                  <th className="text-left px-3 py-2 font-medium">Proveedor</th>
                  <th className="text-left px-3 py-2 font-medium">Modelo</th>
                  <th className="text-left px-3 py-2 font-medium">Op</th>
                  <th className="text-left px-3 py-2 font-medium">Capa</th>
                  <th className="text-right px-3 py-2 font-medium">Costo</th>
                  <th className="text-right px-3 py-2 font-medium">Latencia</th>
                  <th className="text-left px-3 py-2 font-medium">Proyecto</th>
                  <th className="text-left px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {(calls?.calls ?? []).map((c) => (
                  <tr key={c.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="px-3 py-2 text-neutral-700 whitespace-nowrap">{formatTime(c.createdAt)}</td>
                    <td className="px-3 py-2 text-neutral-700">{c.provider}</td>
                    <td className="px-3 py-2 text-neutral-700 font-mono truncate max-w-[14rem]" title={c.model}>{c.model}</td>
                    <td className="px-3 py-2 text-neutral-700">{c.operation}</td>
                    <td className="px-3 py-2 text-neutral-500">{c.layerType ?? '—'}</td>
                    <td className="px-3 py-2 text-neutral-700 text-right font-mono">{c.costUsd != null ? usd(c.costUsd) : '—'}</td>
                    <td className="px-3 py-2 text-neutral-500 text-right">{formatLatency(c.latencyMs)}</td>
                    <td className="px-3 py-2 text-neutral-500 truncate max-w-[12rem]" title={c.projectName ?? ''}>{c.projectName ?? '—'}</td>
                    <td className="px-3 py-2">
                      {c.success
                        ? <span className="text-emerald-700">ok</span>
                        : <span className="text-red-600" title={c.errorMessage ?? ''}>error</span>}
                    </td>
                  </tr>
                ))}
                {(calls?.calls ?? []).length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-neutral-400">Sin llamadas registradas todavía.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => hasPrev && setPage((p) => p - 1)}
              disabled={!hasPrev || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-neutral-200 rounded-md hover:border-neutral-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Anterior
            </button>
            <button
              onClick={() => hasNext && setPage((p) => p + 1)}
              disabled={!hasNext || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-neutral-200 rounded-md hover:border-neutral-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function FalIndicator({ available }: { available: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-neutral-600">
      <span className={`inline-block w-2 h-2 rounded-full ${available ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
      FAL: {available ? 'configurado' : 'sin configurar'}
    </span>
  );
}

function TotalsCard({ label, bucket }: { label: string; bucket: TotalsBucket | undefined }) {
  return (
    <div className="border border-neutral-200 rounded-lg px-4 py-3">
      <p className="text-xs uppercase tracking-[0.15em] text-neutral-400">{label}</p>
      <p className="text-xl font-light text-neutral-900 mt-1 font-mono">
        {bucket ? usd(bucket.cost) : '—'}
      </p>
      <p className="text-xs text-neutral-500 mt-1">
        {bucket ? `${bucket.calls.toLocaleString()} calls` : ''}
      </p>
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-neutral-50 text-neutral-500">
          <tr>
            {columns.map((c, i) => (
              <th
                key={c}
                className={`px-3 py-2 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-neutral-400">Sin datos.</td></tr>
          ) : (
            rows.map((row, ri) => (
              <tr key={ri} className="border-t border-neutral-100">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`px-3 py-2 text-neutral-700 ${ci === 0 ? 'text-left' : 'text-right font-mono'}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
