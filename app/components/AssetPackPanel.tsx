'use client';

/**
 * AssetPackPanel — the Layered Studio surface on the post page.
 *
 * F3 (this batch): real data wiring. The component fetches
 * GET /api/posts/[id]/asset-pack on mount, renders the composite preview
 * from the active pack, populates each layer tab with its image (or empty
 * state), and lights up status dots per real layer state.
 *
 * Still pending:
 *   F4: per-layer Regenerar + notes + Descargar PNG actions.
 *   F5: per-layer Subir mi propia (upload-replace).
 *   F6: pack-level Generar pack completo action.
 *   F7: real Style card sidebar (palette + mood + Pinterest thumbs).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Layers, Loader2, RefreshCw, Download, Upload } from 'lucide-react';

export type LayerTabType =
  | 'background'
  | 'building'
  | 'environment'
  | 'featured'
  | 'ornaments'
  | 'people';

export type PackStatus     = 'pending' | 'generating' | 'ready' | 'failed' | 'partial';
export type GenerationPath = 'decompose' | 'per-layer' | 'hybrid';

interface ApiLayer {
  layerType:           LayerTabType | 'composite';
  imageId:             string;
  storagePath:         string;
  signedUrl:           string;
  downloadUrl:         string;
  transparencyApplied: boolean;
}

interface ApiPack {
  assetPackId:    string | null;
  postId?:        string;
  projectId?:     string;
  status?:        PackStatus;
  generationPath?: GenerationPath;
  layers?:        ApiLayer[];
}

interface LayerTabSpec {
  id:    LayerTabType;
  label: string;
  hint:  string;
}

const LAYER_TABS: LayerTabSpec[] = [
  { id: 'background',  label: 'Fondo',      hint: 'Cielo, paisaje, atmósfera — el plato trasero de la composición.' },
  { id: 'building',    label: 'Edificio',   hint: 'El render ancla del proyecto, recortado sin fondo.' },
  { id: 'environment', label: 'Entorno',    hint: 'Vegetación, caminos, texturas de piso alrededor del edificio.' },
  { id: 'featured',    label: 'Destacado',  hint: 'La amenidad o actividad protagonista de este post.' },
  { id: 'ornaments',   label: 'Ornamentos', hint: 'Acentos atmosféricos — lámparas, bancas, flores, decoración.' },
  { id: 'people',      label: 'Personas',   hint: 'Una persona realizando la acción del post.' },
];

// Checkerboard background indicating transparent areas in a layer preview.
const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), ' +
    'linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), ' +
    'linear-gradient(45deg, transparent 75%, #e5e7eb 75%), ' +
    'linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
  backgroundColor: '#f8fafc',
};

interface AssetPackPanelProps {
  postId:    string;
  projectId: string;
}

export default function AssetPackPanel({ postId, projectId: _projectId }: AssetPackPanelProps) {
  const [activeTab, setActiveTab]   = useState<LayerTabType>('background');
  const [pack, setPack]             = useState<ApiPack | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [notes, setNotes]               = useState<Partial<Record<LayerTabType, string>>>({});
  const [regenerating, setRegenerating] = useState<LayerTabType | null>(null);
  const [regenErrors, setRegenErrors]   = useState<Partial<Record<LayerTabType, string>>>({});
  const [uploading, setUploading]       = useState<LayerTabType | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Partial<Record<LayerTabType, string>>>({});

  const fetchPack = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/posts/${postId}/asset-pack`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as ApiPack;
      setPack(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => { fetchPack(); }, [fetchPack]);

  const handleUpload = useCallback(async (layerType: LayerTabType, file: File) => {
    setUploading(layerType);
    setUploadErrors((prev) => ({ ...prev, [layerType]: undefined }));
    try {
      // 1 — request a signed upload URL targeting the canonical layer path.
      const urlRes = await fetch(`/api/posts/${postId}/asset-pack/layers/${layerType}/upload-url`, {
        method: 'POST',
      });
      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => ({}));
        throw new Error(body.error || `No se pudo obtener la URL de carga (HTTP ${urlRes.status})`);
      }
      const { signedUrl } = await urlRes.json();

      // 2 — PUT the file directly to Supabase Storage.
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/png' },
        body:    file,
      });
      if (!putRes.ok) throw new Error(`Error al subir el archivo (HTTP ${putRes.status})`);

      // 3 — notify the server so it can swap the images row.
      const regRes = await fetch(`/api/posts/${postId}/asset-pack/layers/${layerType}`, {
        method: 'PUT',
      });
      if (!regRes.ok) {
        const body = await regRes.json().catch(() => ({}));
        throw new Error(body.error || `Error al registrar la subida (HTTP ${regRes.status})`);
      }
      const updatedLayer = await regRes.json() as ApiLayer;
      setPack((prev) => {
        if (!prev) return prev;
        const others = (prev.layers ?? []).filter((l) => l.layerType !== updatedLayer.layerType);
        return { ...prev, layers: [...others, updatedLayer] };
      });
    } catch (e) {
      setUploadErrors((prev) => ({
        ...prev,
        [layerType]: e instanceof Error ? e.message : 'Error desconocido',
      }));
    } finally {
      setUploading(null);
    }
  }, [postId]);

  const handleRegenerate = useCallback(async (layerType: LayerTabType) => {
    setRegenerating(layerType);
    setRegenErrors((prev) => ({ ...prev, [layerType]: undefined }));
    try {
      const res = await fetch(`/api/posts/${postId}/asset-pack/layers/${layerType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refinementPrompt: notes[layerType] ?? '' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const updatedLayer = await res.json() as ApiLayer;
      setPack((prev) => {
        if (!prev) return prev;
        const others = (prev.layers ?? []).filter((l) => l.layerType !== updatedLayer.layerType);
        return { ...prev, layers: [...others, updatedLayer] };
      });
    } catch (e) {
      setRegenErrors((prev) => ({
        ...prev,
        [layerType]: e instanceof Error ? e.message : 'Error desconocido',
      }));
    } finally {
      setRegenerating(null);
    }
  }, [postId, notes]);

  const layers       = pack?.layers ?? [];
  const composite    = layers.find((l) => l.layerType === 'composite');
  const layersByType = Object.fromEntries(layers.map((l) => [l.layerType, l]));
  const activeLayer  = layersByType[activeTab];
  const active       = LAYER_TABS.find((t) => t.id === activeTab) ?? LAYER_TABS[0];
  const packStatus   = pack?.status ?? null;

  // Status dot kind per tab based on actual pack state.
  const dotKindFor = (id: LayerTabType): StatusKind => {
    if (packStatus === 'generating')             return 'generating';
    if (!layersByType[id])                       return 'empty';
    return 'ready';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400">Estudio de capas</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            Genera el pack, ajusta cada capa por separado, descárgalas a Photoshop.
          </p>
        </div>
        <button
          disabled
          className="inline-flex items-center gap-2 px-4 py-2 text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-lg cursor-not-allowed"
          title="Disponible en F6"
        >
          <Layers className="w-3.5 h-3.5" />
          Generar pack completo
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500">No se pudo cargar el pack: {error}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">

        {/* Main panel */}
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">

          {/* Composite preview row */}
          <div className="flex items-start gap-4 p-4 border-b border-neutral-100">
            <CompositeThumb layer={composite} loading={loading} status={packStatus} />
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-400">Composición</p>
              <p className="text-xs text-neutral-500 mt-1">
                Vista previa que la IA arma con todas las capas juntas. Sirve como referencia rápida; la composición final la haces en Photoshop con las capas individuales.
              </p>
              {packStatus && (
                <p className="text-xs text-neutral-400 mt-2">
                  Estado del pack: <PackStatusBadge status={packStatus} />
                </p>
              )}
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 px-3 pt-3 overflow-x-auto" role="tablist">
            {LAYER_TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-neutral-900 text-neutral-900 font-medium'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot kind={dotKindFor(tab.id)} />
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active tab body */}
          <div className="p-6 min-h-[280px] space-y-5">
            <LayerBody
              loading={loading}
              packStatus={packStatus}
              packExists={!!pack?.assetPackId}
              layer={activeLayer}
              labelHint={active.hint}
              label={active.label}
            />

            {/* Actions appear once the pack exists, regardless of whether this layer is filled */}
            {!loading && pack?.assetPackId && packStatus !== 'generating' && (
              <LayerActions
                layerType={activeTab}
                label={active.label}
                layer={activeLayer}
                notes={notes[activeTab] ?? ''}
                onNotesChange={(v) => setNotes((prev) => ({ ...prev, [activeTab]: v }))}
                regenerating={regenerating === activeTab}
                regenError={regenErrors[activeTab]}
                onRegenerate={() => handleRegenerate(activeTab)}
                uploading={uploading === activeTab}
                uploadError={uploadErrors[activeTab]}
                onUpload={(file) => handleUpload(activeTab, file)}
              />
            )}
          </div>
        </div>

        {/* Style sidebar — F7 fills this in */}
        <aside className="bg-white border border-neutral-200 rounded-2xl p-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400">Estilo</p>
          <p className="text-xs text-neutral-400">
            Paleta, mood, y referencias de Pinterest aparecerán aquí (F7).
          </p>
        </aside>
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function CompositeThumb({
  layer,
  loading,
  status,
}: {
  layer:   ApiLayer | undefined;
  loading: boolean;
  status:  PackStatus | null;
}) {
  if (loading) {
    return (
      <div className="w-24 h-30 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-neutral-400 animate-spin" />
      </div>
    );
  }
  if (status === 'generating') {
    return (
      <div className="w-24 h-30 rounded-lg bg-neutral-50 border border-neutral-200 flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-neutral-400 animate-spin" />
      </div>
    );
  }
  if (!layer) {
    return (
      <div className="w-24 h-30 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center text-[10px] text-neutral-400 text-center px-1">
        Sin pack
      </div>
    );
  }
  return (
    <div className="w-24 h-30 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={layer.signedUrl} alt="Composición" className="w-full h-full object-cover" />
    </div>
  );
}

function LayerBody({
  loading,
  packStatus,
  packExists,
  layer,
  label,
  labelHint,
}: {
  loading:    boolean;
  packStatus: PackStatus | null;
  packExists: boolean;
  layer:      ApiLayer | undefined;
  label:      string;
  labelHint:  string;
}) {
  if (loading) {
    return (
      <div className="w-full flex flex-col items-center gap-3 py-12">
        <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" />
        <p className="text-xs text-neutral-400">Cargando capa…</p>
      </div>
    );
  }

  if (!packExists) {
    return (
      <div className="w-full border border-dashed border-neutral-200 rounded-xl px-6 py-12 flex flex-col items-center gap-3 text-center">
        <Layers className="w-5 h-5 text-neutral-300" />
        <p className="text-sm text-neutral-500">Capa: {label}</p>
        <p className="text-xs text-neutral-400 max-w-md">{labelHint}</p>
        <p className="text-xs text-neutral-300 mt-3">
          Aún no hay pack para este post. Generar pack completo se conectará en F6.
        </p>
      </div>
    );
  }

  if (packStatus === 'generating') {
    return (
      <div className="w-full flex flex-col items-center gap-3 py-12">
        <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" />
        <p className="text-xs text-neutral-400">Generando capas…</p>
      </div>
    );
  }

  if (!layer) {
    return (
      <div className="w-full border border-dashed border-neutral-200 rounded-xl px-6 py-12 flex flex-col items-center gap-3 text-center">
        <Layers className="w-5 h-5 text-neutral-300" />
        <p className="text-sm text-neutral-500">Sin capa de {label.toLowerCase()}</p>
        <p className="text-xs text-neutral-400 max-w-md">{labelHint}</p>
        <p className="text-xs text-neutral-300 mt-3">
          Regenerar esta capa estará disponible en F4.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div
        className="max-w-md w-full aspect-[4/5] rounded-xl overflow-hidden border border-neutral-200"
        style={layer.transparencyApplied ? CHECKERBOARD_STYLE : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={layer.signedUrl} alt={label} className="w-full h-full object-contain" />
      </div>
      <p className="text-[10px] text-neutral-400">
        {layer.transparencyApplied ? 'PNG con fondo transparente' : 'PNG opaco'}
      </p>
    </div>
  );
}

function LayerActions({
  layerType,
  label,
  layer,
  notes,
  onNotesChange,
  regenerating,
  regenError,
  onRegenerate,
  uploading,
  uploadError,
  onUpload,
}: {
  layerType:     LayerTabType;
  label:         string;
  layer:         ApiLayer | undefined;
  notes:         string;
  onNotesChange: (v: string) => void;
  regenerating:  boolean;
  regenError:    string | undefined;
  onRegenerate:  () => void;
  uploading:     boolean;
  uploadError:   string | undefined;
  onUpload:      (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = regenerating || uploading;

  return (
    <div className="space-y-3 border-t border-neutral-100 pt-5">
      <div>
        <label className="block text-xs uppercase tracking-[0.15em] text-neutral-400 mb-2">
          Notas para esta capa — opcional
        </label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          disabled={busy}
          placeholder={`Indicaciones específicas para regenerar ${label.toLowerCase()} — ej. "persona corriendo en ropa deportiva, a media zancada"`}
          rows={2}
          className="w-full text-sm text-neutral-700 placeholder-neutral-300 border border-neutral-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-neutral-400 transition-colors disabled:opacity-50"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onRegenerate}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-xs rounded-lg hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {regenerating
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />}
          {regenerating ? 'Regenerando…' : (layer ? 'Regenerar esta capa' : 'Generar esta capa')}
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs border border-neutral-200 rounded-lg text-neutral-700 hover:border-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Upload className="w-3.5 h-3.5" />}
          {uploading ? 'Subiendo…' : 'Subir mi propia'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />

        {layer?.downloadUrl && (
          <a
            href={layer.downloadUrl}
            download={`${layerType}.png`}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs border border-neutral-200 rounded-lg text-neutral-700 hover:border-neutral-400 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar PNG
          </a>
        )}
      </div>

      {regenError  && <p className="text-xs text-red-500">{regenError}</p>}
      {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
    </div>
  );
}

function PackStatusBadge({ status }: { status: PackStatus }) {
  const map: Record<PackStatus, { label: string; cls: string }> = {
    pending:    { label: 'pendiente',  cls: 'text-neutral-500' },
    generating: { label: 'generando',  cls: 'text-amber-600'   },
    ready:      { label: 'listo',      cls: 'text-emerald-700' },
    partial:    { label: 'parcial',    cls: 'text-amber-600'   },
    failed:     { label: 'falló',      cls: 'text-red-600'     },
  };
  const m = map[status];
  return <span className={`${m.cls} font-medium`}>{m.label}</span>;
}

type StatusKind = 'ready' | 'generating' | 'failed' | 'empty';

function StatusDot({ kind }: { kind: StatusKind }) {
  const color =
    kind === 'ready'      ? 'bg-emerald-500'           :
    kind === 'generating' ? 'bg-amber-400 animate-pulse' :
    kind === 'failed'     ? 'bg-red-500'               :
                            'bg-neutral-200';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} aria-hidden="true" />;
}
