'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload, X, Loader2 } from 'lucide-react';
import { EMPTY_PROJECT_BRAND, type ProjectBrandGuidelines } from '@/lib/brand';
import {
  SectionLabel, Field, ColorGroup, TagList,
} from '@/app/components/brand/BrandFields';

export default function ProjectBrandPage() {
  const params    = useParams();
  const projectId = params.id as string;

  const [projectName, setProjectName] = useState('');
  const [brand, setBrand]             = useState<ProjectBrandGuidelines>(EMPTY_PROJECT_BRAND);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);

  const [parseFiles, setParseFiles]   = useState<File[]>([]);
  const [parsing, setParsing]         = useState(false);
  const [parseError, setParseError]   = useState<string | null>(null);
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  const fetchBrand = useCallback(async () => {
    try {
      const res  = await fetch(`/api/projects/${projectId}/brand`);
      const data = await res.json();
      setProjectName(data.project_name ?? '');
      setBrand(data.brand_guidelines ?? EMPTY_PROJECT_BRAND);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchBrand(); }, [fetchBrand]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/projects/${projectId}/brand`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_guidelines: brand }),
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
      // 1 — upload each file directly to Supabase Storage (bypasses Vercel body limit)
      const uploaded: { path: string; mimeType: string }[] = [];
      for (const file of parseFiles) {
        const urlRes = await fetch(`/api/projects/${projectId}/brand/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name }),
        });
        if (!urlRes.ok) throw new Error('No se pudo obtener la URL de carga');
        const { signedUrl, path } = await urlRes.json();

        const uploadRes = await fetch(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!uploadRes.ok) throw new Error(`Error al subir "${file.name}"`);
        uploaded.push({ path, mimeType: file.type });
      }

      // 2 — ask the server to extract project brand guidelines from the stored paths
      const res = await fetch(`/api/projects/${projectId}/brand/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: uploaded }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar los archivos');

      setBrand(data.brand_guidelines);
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
            <Link
              href={`/projects/${projectId}`}
              className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-700 transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              {projectName || 'Campaña'}
            </Link>
            <h1 className="text-2xl font-light text-neutral-900">{projectName}</h1>
            <p className="text-sm text-neutral-400 mt-1">Brand del proyecto</p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-sm rounded-lg hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
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
            <p className="text-sm text-neutral-500 mb-1">PDF o imágenes del brief del proyecto</p>
            <p className="text-xs text-neutral-300">Clic para seleccionar — puedes subir varios archivos</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) setParseFiles(Array.from(e.target.files)); e.target.value = ''; }}
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
                {parsing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {parsing ? 'Analizando con IA…' : 'Extraer Brand del proyecto'}
              </button>
            </div>
          )}
          {parseError && <p className="text-xs text-red-500">{parseError}</p>}
        </div>

        {/* Concepto */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <SectionLabel>Concepto del proyecto</SectionLabel>
          <Field
            label="Mood general"
            value={brand.mood ?? ''}
            onChange={v => set(['mood'], v)}
            placeholder="Luminoso y aspiracional, calidez residencial…"
            rows={2}
          />
          <Field
            label="Atmósfera"
            value={brand.atmosphere ?? ''}
            onChange={v => set(['atmosphere'], v)}
            placeholder="Sensación de hogar, exclusividad accesible, tranquilidad…"
            rows={2}
          />
          <Field
            label="Diferenciadores visuales clave"
            value={brand.key_differentiators ?? ''}
            onChange={v => set(['key_differentiators'], v)}
            placeholder="Lo que hace únicos a estos espacios frente a la competencia…"
            rows={2}
          />
        </div>

        {/* Audiencia */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <SectionLabel>Audiencia objetivo</SectionLabel>
          <Field
            label="Perfil del comprador"
            value={brand.target_audience ?? ''}
            onChange={v => set(['target_audience'], v)}
            placeholder="Familias jóvenes, profesionistas 30-45 años, primera vivienda…"
            rows={3}
          />
        </div>

        {/* Fotografía */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <SectionLabel>Dirección fotográfica</SectionLabel>
          <Field
            label="Lineamientos específicos de este desarrollo"
            value={brand.photography_direction ?? ''}
            onChange={v => set(['photography_direction'], v)}
            placeholder="Ángulos amplios para enfatizar espacio, luz natural en ventanas, sin personas en interiores…"
            rows={4}
          />
        </div>

        {/* Colores de acento */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <SectionLabel>Colores de acento del proyecto</SectionLabel>
          <p className="text-xs text-neutral-400 -mt-2">
            Colores específicos de este desarrollo que complementan o contrastan con el Brand DNA corporativo.
          </p>
          <ColorGroup
            label="Acento"
            colors={brand.colors.accent}
            onChange={v => set(['colors', 'accent'], v)}
          />
        </div>

        {/* Prohibiciones */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <SectionLabel>No hacer — exclusivo de este proyecto</SectionLabel>
          <TagList
            label="Elementos o tratamientos que nunca deben aparecer en este desarrollo"
            tags={brand.do_not}
            onChange={v => set(['do_not'], v)}
          />
        </div>

        {/* Bottom save */}
        <div className="flex justify-end pb-8">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white text-sm rounded-lg hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar Brand del proyecto'}
          </button>
        </div>

      </div>
    </div>
  );
}
