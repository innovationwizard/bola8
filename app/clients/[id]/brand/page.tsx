'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload, X, Plus, Loader2 } from 'lucide-react';
import { EMPTY_BRAND_DNA, type BrandDNA, type BrandColor } from '@/lib/brand';

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 mb-4">{children}</p>
  );
}

function Field({ label, value, onChange, placeholder, rows = 1 }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-neutral-500">{label}</label>
      {rows === 1 ? (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full text-sm text-neutral-800 bg-transparent border-b border-neutral-200 focus:border-neutral-600 outline-none py-1.5 transition-colors placeholder-neutral-300"
        />
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full text-sm text-neutral-800 bg-transparent border border-neutral-200 rounded-lg focus:border-neutral-400 outline-none px-3 py-2 resize-none transition-colors placeholder-neutral-300"
        />
      )}
    </div>
  );
}

function ColorRow({ color, onChange, onRemove }: {
  color: BrandColor;
  onChange: (c: BrandColor) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-shrink-0">
        <input
          type="color"
          value={color.hex || '#000000'}
          onChange={e => onChange({ ...color, hex: e.target.value })}
          className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
          title="Pick color"
        />
      </div>
      <input
        type="text"
        value={color.hex}
        onChange={e => onChange({ ...color, hex: e.target.value })}
        placeholder="#000000"
        maxLength={7}
        className="w-20 text-xs font-mono text-neutral-600 border-b border-neutral-200 focus:border-neutral-500 outline-none py-1 bg-transparent uppercase"
      />
      <input
        type="text"
        value={color.name}
        onChange={e => onChange({ ...color, name: e.target.value })}
        placeholder="Nombre"
        className="flex-1 text-sm text-neutral-800 border-b border-neutral-200 focus:border-neutral-500 outline-none py-1 bg-transparent"
      />
      <input
        type="text"
        value={color.usage}
        onChange={e => onChange({ ...color, usage: e.target.value })}
        placeholder="Uso"
        className="flex-1 text-xs text-neutral-500 border-b border-neutral-200 focus:border-neutral-500 outline-none py-1 bg-transparent"
      />
      <button onClick={onRemove} className="text-neutral-300 hover:text-neutral-600 transition-colors flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ColorGroup({ label, colors, onChange }: {
  label: string;
  colors: BrandColor[];
  onChange: (colors: BrandColor[]) => void;
}) {
  const add = () => onChange([...colors, { name: '', hex: '#000000', usage: '' }]);
  const update = (i: number, c: BrandColor) => onChange(colors.map((x, j) => j === i ? c : x));
  const remove = (i: number) => onChange(colors.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500">{label}</span>
        <button onClick={add} className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700 transition-colors">
          <Plus className="w-3 h-3" /> Agregar
        </button>
      </div>
      {colors.length === 0 && (
        <p className="text-xs text-neutral-300 italic">Sin colores definidos</p>
      )}
      <div className="space-y-2">
        {colors.map((c, i) => (
          <ColorRow key={i} color={c} onChange={v => update(i, v)} onRemove={() => remove(i)} />
        ))}
      </div>
    </div>
  );
}

function TagList({ label, tags, onChange }: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const add = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) { onChange([...tags, t]); setInput(''); }
  };
  return (
    <div className="space-y-2">
      <label className="block text-xs text-neutral-500">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-xs text-neutral-700 rounded-full">
            {t}
            <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-neutral-700">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Escribir y Enter para agregar"
          className="flex-1 text-sm text-neutral-800 bg-transparent border-b border-neutral-200 focus:border-neutral-500 outline-none py-1 placeholder-neutral-300"
        />
        <button onClick={add} className="text-xs text-neutral-500 hover:text-neutral-800 transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BrandEditorPage() {
  const params   = useParams();
  const clientId = params.id as string;

  const [clientName, setClientName] = useState('');
  const [brand, setBrand]           = useState<BrandDNA>(EMPTY_BRAND_DNA);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);

  const [parseFiles, setParseFiles] = useState<File[]>([]);
  const [parsing, setParsing]       = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchClient = useCallback(async () => {
    try {
      const res  = await fetch(`/api/clients/${clientId}`);
      const data = await res.json();
      setClientName(data.client.name);
      setBrand(data.client.brand_dna ?? EMPTY_BRAND_DNA);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchClient(); }, [fetchClient]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_dna: brand }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleParse = async () => {
    if (parseFiles.length === 0) return;
    setParsing(true);
    setParseError(null);
    try {
      const form = new FormData();
      parseFiles.forEach(f => form.append('files', f));
      const res  = await fetch(`/api/clients/${clientId}/brand/parse`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar los archivos');
      setBrand(data.brand_dna);
      setParseFiles([]);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setParsing(false);
    }
  };

  const set = (path: string[], value: unknown) => {
    setBrand(prev => {
      const next = structuredClone(prev);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let node: any = next;
      for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
      node[path[path.length - 1]] = value;
      return next;
    });
  };

  if (loading) return (
    <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center">
      <p className="text-neutral-400 text-sm">Cargando...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-3xl mx-auto px-8 py-16 space-y-12">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-700 transition-colors mb-6">
              <ArrowLeft className="w-4 h-4" />
              Campaigns
            </Link>
            <h1 className="text-2xl font-light text-neutral-900">{clientName}</h1>
            <p className="text-sm text-neutral-400 mt-1">Brand DNA</p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-sm rounded-lg hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar'}
          </button>
        </div>

        {/* Parse from files */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <SectionLabel>Extraer desde archivos</SectionLabel>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-neutral-200 rounded-xl px-8 py-10 text-center cursor-pointer hover:border-neutral-400 transition-colors"
          >
            <Upload className="w-6 h-6 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm text-neutral-500 mb-1">PDF o imágenes del manual de marca</p>
            <p className="text-xs text-neutral-300">Clic para seleccionar — puedes subir varios archivos</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files) setParseFiles(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
          {parseFiles.length > 0 && (
            <div className="space-y-1.5">
              {parseFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-neutral-600 bg-neutral-50 px-3 py-2 rounded-lg">
                  <span className="truncate">{f.name}</span>
                  <button onClick={() => setParseFiles(fs => fs.filter((_, j) => j !== i))} className="ml-3 text-neutral-400 hover:text-neutral-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={handleParse}
                disabled={parsing}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-xs rounded-lg hover:bg-neutral-700 disabled:opacity-50 transition-colors"
              >
                {parsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {parsing ? 'Analizando con IA…' : 'Extraer brand DNA'}
              </button>
            </div>
          )}
          {parseError && <p className="text-xs text-red-500">{parseError}</p>}
        </div>

        {/* Identidad */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <SectionLabel>Identidad</SectionLabel>
          <Field label="Tagline" value={brand.identity.tagline ?? ''} onChange={v => set(['identity', 'tagline'], v)} placeholder="La promesa de la marca en una frase" />
          <Field label="Misión" value={brand.identity.mission ?? ''} onChange={v => set(['identity', 'mission'], v)} placeholder="Para qué existe la marca" rows={2} />
          <Field label="Posicionamiento" value={brand.identity.positioning ?? ''} onChange={v => set(['identity', 'positioning'], v)} placeholder="Cómo se diferencia en el mercado" rows={2} />
        </div>

        {/* Colores */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-7">
          <SectionLabel>Paleta de colores</SectionLabel>
          <ColorGroup label="Primarios" colors={brand.colors.primary} onChange={v => set(['colors', 'primary'], v)} />
          <div className="border-t border-neutral-100 pt-6">
            <ColorGroup label="Secundarios" colors={brand.colors.secondary} onChange={v => set(['colors', 'secondary'], v)} />
          </div>
          <div className="border-t border-neutral-100 pt-6">
            <ColorGroup label="Neutrales" colors={brand.colors.neutrals} onChange={v => set(['colors', 'neutrals'], v)} />
          </div>
          <div className="border-t border-neutral-100 pt-6">
            <ColorGroup label="Acento" colors={brand.colors.accent} onChange={v => set(['colors', 'accent'], v)} />
          </div>
        </div>

        {/* Tipografía */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <SectionLabel>Tipografía</SectionLabel>
          <Field label="Fuente principal" value={brand.typography.primary_font ?? ''} onChange={v => set(['typography', 'primary_font'], v)} placeholder="Montserrat, Playfair Display…" />
          <Field label="Fuente secundaria" value={brand.typography.secondary_font ?? ''} onChange={v => set(['typography', 'secondary_font'], v)} placeholder="Fuente de apoyo" />
          <Field label="Jerarquía tipográfica" value={brand.typography.hierarchy_notes ?? ''} onChange={v => set(['typography', 'hierarchy_notes'], v)} placeholder="Reglas de uso: títulos, cuerpo, citas…" rows={2} />
        </div>

        {/* Fotografía */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <SectionLabel>Fotografía</SectionLabel>
          <Field label="Estilo" value={brand.photography.style ?? ''} onChange={v => set(['photography', 'style'], v)} placeholder="Editorial, documental, aspiracional…" />
          <Field label="Ambiente" value={brand.photography.mood ?? ''} onChange={v => set(['photography', 'mood'], v)} placeholder="Cálido, íntimo, luminoso…" />
          <Field label="Iluminación" value={brand.photography.lighting ?? ''} onChange={v => set(['photography', 'lighting'], v)} placeholder="Natural suave, golden hour, estudio difuso…" />
          <Field label="Composición" value={brand.photography.composition ?? ''} onChange={v => set(['photography', 'composition'], v)} placeholder="Regla de tercios, espacio negativo, primer plano…" />
          <Field label="Sujetos principales" value={brand.photography.subjects ?? ''} onChange={v => set(['photography', 'subjects'], v)} placeholder="Espacios interiores, lifestyle, familia…" />
          <Field label="Evitar" value={brand.photography.avoid ?? ''} onChange={v => set(['photography', 'avoid'], v)} placeholder="Filtros excesivos, colores saturados, planos cenital…" rows={2} />
        </div>

        {/* Tono de voz */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <SectionLabel>Tono de voz</SectionLabel>
          <Field label="Personalidad" value={brand.tone_of_voice.personality ?? ''} onChange={v => set(['tone_of_voice', 'personality'], v)} placeholder="Sofisticada, accesible, confiable…" />
          <TagList label="Palabras clave a transmitir" tags={brand.tone_of_voice.keywords} onChange={v => set(['tone_of_voice', 'keywords'], v)} />
          <TagList label="Palabras a evitar" tags={brand.tone_of_voice.avoid} onChange={v => set(['tone_of_voice', 'avoid'], v)} />
        </div>

        {/* Estilo visual */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <SectionLabel>Estilo visual</SectionLabel>
          <Field label="Estética general" value={brand.visual_style.aesthetic ?? ''} onChange={v => set(['visual_style', 'aesthetic'], v)} placeholder="Minimalismo cálido, lujo discreto, modernidad latina…" rows={2} />
          <TagList label="Descriptores de mood" tags={brand.visual_style.mood_descriptors} onChange={v => set(['visual_style', 'mood_descriptors'], v)} />
        </div>

        {/* No hacer */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <SectionLabel>No hacer — prohibiciones absolutas</SectionLabel>
          <TagList label="Elementos y tratamientos que nunca deben aparecer" tags={brand.do_not} onChange={v => set(['do_not'], v)} />
        </div>

        {/* Bottom save */}
        <div className="flex justify-end pb-8">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white text-sm rounded-lg hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar Brand DNA'}
          </button>
        </div>

      </div>
    </div>
  );
}
