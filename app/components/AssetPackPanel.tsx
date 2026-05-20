'use client';

/**
 * AssetPackPanel — the Layered Studio surface that lives on the post page.
 *
 * F1 (this batch): read-only scaffolding only. The visual skeleton is in
 * place — 6 layer tabs + composite preview slot + Style sidebar slot — but
 * nothing fetches data, nothing regenerates, nothing downloads. Subsequent
 * batches fill it in:
 *
 *   F2: wire into the post detail page.
 *   F3: per-tab preview rendering (fetch /api/posts/[id]/asset-pack on mount).
 *   F4: per-layer Regenerar + notes + Descargar PNG.
 *   F5: per-layer Subir mi propia (upload-replace).
 *   F6: pack-level Generar pack completo action.
 *   F7: real Style card sidebar (palette swatches + mood + Pinterest thumbs).
 */

import { useState } from 'react';
import { Layers } from 'lucide-react';

export type LayerTabType =
  | 'background'
  | 'building'
  | 'environment'
  | 'featured'
  | 'ornaments'
  | 'people';

interface LayerTabSpec {
  id:        LayerTabType;
  label:     string;       // Spanish, designer-facing
  hint:      string;       // one-line description for the empty state
}

/**
 * Display order across the top of the panel. Reflects the user's mental
 * back-to-front composition: background first, building anchor, environment
 * around it, then the optional layers.
 */
const LAYER_TABS: LayerTabSpec[] = [
  { id: 'background',  label: 'Fondo',      hint: 'Cielo, paisaje, atmósfera — el plato trasero de la composición.' },
  { id: 'building',    label: 'Edificio',   hint: 'El render ancla del proyecto, recortado sin fondo.' },
  { id: 'environment', label: 'Entorno',    hint: 'Vegetación, caminos, texturas de piso alrededor del edificio.' },
  { id: 'featured',    label: 'Destacado',  hint: 'La amenidad o actividad protagonista de este post.' },
  { id: 'ornaments',   label: 'Ornamentos', hint: 'Acentos atmosféricos — lámparas, bancas, flores, decoración.' },
  { id: 'people',      label: 'Personas',   hint: 'Una persona realizando la acción del post.' },
];

interface AssetPackPanelProps {
  postId:    string;
  projectId: string;
}

export default function AssetPackPanel({ postId: _postId, projectId: _projectId }: AssetPackPanelProps) {
  const [activeTab, setActiveTab] = useState<LayerTabType>('background');
  const active = LAYER_TABS.find((t) => t.id === activeTab) ?? LAYER_TABS[0];

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
        {/* Pack-level actions wire in F6. */}
        <button
          disabled
          className="inline-flex items-center gap-2 px-4 py-2 text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-lg cursor-not-allowed"
          title="Disponible en F6"
        >
          <Layers className="w-3.5 h-3.5" />
          Generar pack completo
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">

        {/* Main panel: composite preview + tabs + active layer */}
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">

          {/* Composite preview row */}
          <div className="flex items-start gap-4 p-4 border-b border-neutral-100">
            <div className="w-24 h-30 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center text-[10px] text-neutral-400 text-center px-1">
              Vista previa
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-400">Composición</p>
              <p className="text-xs text-neutral-500 mt-1">
                Vista previa que la IA arma con todas las capas juntas. Sirve como referencia rápida; la composición final la haces en Photoshop con las capas individuales.
              </p>
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
                    <StatusDot kind="empty" />
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active tab body — F1 shows the empty/placeholder state only */}
          <div className="p-6 min-h-[280px]">
            <div className="w-full border border-dashed border-neutral-200 rounded-xl px-6 py-12 flex flex-col items-center gap-3 text-center">
              <Layers className="w-5 h-5 text-neutral-300" />
              <p className="text-sm text-neutral-500">Capa: {active.label}</p>
              <p className="text-xs text-neutral-400 max-w-md">{active.hint}</p>
              <p className="text-xs text-neutral-300 mt-3">
                Las capas aparecerán aquí en F3 cuando se conecte la lectura del pack.
              </p>
            </div>
          </div>
        </div>

        {/* Style card sidebar — F7 fills this in */}
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

// ── Small visual primitives ───────────────────────────────────────────────────

type StatusKind = 'ready' | 'generating' | 'failed' | 'empty';

function StatusDot({ kind }: { kind: StatusKind }) {
  const color =
    kind === 'ready'      ? 'bg-emerald-500' :
    kind === 'generating' ? 'bg-amber-400'   :
    kind === 'failed'     ? 'bg-red-500'     :
                            'bg-neutral-200';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} aria-hidden="true" />;
}
