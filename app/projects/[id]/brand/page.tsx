'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload, X, Loader2, ImageIcon, Pin } from 'lucide-react';
import { EMPTY_PROJECT_BRAND, type ProjectBrandGuidelines } from '@/lib/brand';
import {
  SectionLabel, Field, ColorGroup, TagList,
} from '@/app/components/brand/BrandFields';

type ReferenceImage = {
  id: string;
  url: string;
  storage_path: string;
  caption: string | null;
  display_order: number;
  role: 'render' | 'style';
  is_pinned: boolean;
};

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

  const [renders, setRenders]               = useState<ReferenceImage[]>([]);
  const [styles, setStyles]                 = useState<ReferenceImage[]>([]);
  const [rendersUploading, setRendersUploading] = useState(false);
  const [stylesUploading, setStylesUploading]   = useState(false);
  const [renderError, setRenderError]       = useState<string | null>(null);
  const [styleError, setStyleError]         = useState<string | null>(null);
  const [deletingId, setDeletingId]         = useState<string | null>(null);
  const [pinningId, setPinningId]           = useState<string | null>(null);
  const rendersInputRef                     = useRef<HTMLInputElement>(null);
  const stylesInputRef                      = useRef<HTMLInputElement>(null);

  const fetchBrand = useCallback(async () => {
    try {
      const [brandRes, rendersRes, stylesRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/brand`),
        fetch(`/api/projects/${projectId}/reference-images?role=render`),
        fetch(`/api/projects/${projectId}/reference-images?role=style`),
      ]);
      const brandData   = await brandRes.json();
      const rendersData = await rendersRes.json();
      const stylesData  = await stylesRes.json();
      setProjectName(brandData.project_name ?? '');
      setBrand(brandData.brand_guidelines ?? EMPTY_PROJECT_BRAND);
      setRenders(rendersData.referenceImages ?? []);
      setStyles(stylesData.referenceImages ?? []);
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

  const handleUpload = async (
    files: FileList | null,
    role: 'render' | 'style',
  ) => {
    if (!files?.length) return;
    const setUploading = role === 'render' ? setRendersUploading : setStylesUploading;
    const setError     = role === 'render' ? setRenderError : setStyleError;
    const setList      = role === 'render' ? setRenders : setStyles;
    const inputRef     = role === 'render' ? rendersInputRef : stylesInputRef;

    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const urlRes = await fetch(`/api/projects/${projectId}/reference-images/upload-url`, {
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

        const saveRes = await fetch(`/api/projects/${projectId}/reference-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath: path, role }),
        });
        if (!saveRes.ok) throw new Error('Error al guardar la imagen');
        const { referenceImage } = await saveRes.json();
        setList(prev => [...prev, referenceImage]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (refId: string) => {
    setDeletingId(refId);
    try {
      const res = await fetch(`/api/projects/${projectId}/reference-images/${refId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar');
      setRenders(prev => prev.filter(r => r.id !== refId));
      setStyles(prev => prev.filter(r => r.id !== refId));
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePin = async (renderId: string) => {
    setPinningId(renderId);
    try {
      const res = await fetch(`/api/projects/${projectId}/reference-images/${renderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: true }),
      });
      if (!res.ok) throw new Error('Error al fijar el render');
      // Optimistic update — only one can be pinned.
      setRenders(prev => prev.map(r => ({ ...r, is_pinned: r.id === renderId })));
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Error al fijar');
    } finally {
      setPinningId(null);
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

        {/* Renders del proyecto */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <div className="flex items-center justify-between">
            <SectionLabel>Renders del proyecto</SectionLabel>
            <button
              onClick={() => rendersInputRef.current?.click()}
              disabled={rendersUploading}
              className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition-colors disabled:opacity-40"
            >
              {rendersUploading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Upload className="w-3.5 h-3.5" />
              }
              {rendersUploading ? 'Subiendo…' : 'Agregar render'}
            </button>
          </div>
          <p className="text-xs text-neutral-400 -mt-2">
            Fija un render como ancla estructural — la IA lo usa como base y aplica el estilo encima. Solo uno puede estar fijado a la vez.
          </p>
          <input
            ref={rendersInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => handleUpload(e.target.files, 'render')}
          />

          {renders.length === 0 && !rendersUploading && (
            <button
              onClick={() => rendersInputRef.current?.click()}
              className="w-full border-2 border-dashed border-neutral-200 rounded-xl px-8 py-10 text-center hover:border-neutral-400 transition-colors"
            >
              <ImageIcon className="w-6 h-6 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500 mb-1">Sin renders</p>
              <p className="text-xs text-neutral-300">Sube renders del edificio o amenidades — la IA los usa como base estructural</p>
            </button>
          )}

          {renders.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {renders.map(img => (
                <div
                  key={img.id}
                  className={`relative group rounded-xl overflow-hidden border aspect-square bg-neutral-100 ${
                    img.is_pinned ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="w-full h-full object-cover" />

                  {/* Pin button */}
                  <button
                    onClick={() => !img.is_pinned && handlePin(img.id)}
                    disabled={pinningId === img.id || img.is_pinned}
                    title={img.is_pinned ? 'Render anclado' : 'Fijar como ancla estructural'}
                    className={`absolute bottom-2 left-2 p-1 bg-white border rounded-full shadow-sm transition-all ${
                      img.is_pinned
                        ? 'border-neutral-900 opacity-100'
                        : 'border-neutral-200 opacity-0 group-hover:opacity-100 hover:border-neutral-600'
                    } disabled:opacity-50`}
                  >
                    {pinningId === img.id
                      ? <Loader2 className="w-3 h-3 animate-spin text-neutral-500" />
                      : <Pin className={`w-3 h-3 ${img.is_pinned ? 'text-neutral-900' : 'text-neutral-500'}`} />
                    }
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(img.id)}
                    disabled={deletingId === img.id}
                    className="absolute top-2 right-2 p-1 bg-white border border-neutral-200 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:border-neutral-400 disabled:opacity-50"
                    aria-label="Eliminar render"
                  >
                    {deletingId === img.id
                      ? <Loader2 className="w-3 h-3 animate-spin text-neutral-500" />
                      : <X className="w-3 h-3 text-neutral-600" />
                    }
                  </button>
                </div>
              ))}
            </div>
          )}

          {renderError && <p className="text-xs text-red-500">{renderError}</p>}
        </div>

        {/* Referencias de estilo */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-8 space-y-5">
          <div className="flex items-center justify-between">
            <SectionLabel>Referencias de estilo</SectionLabel>
            <button
              onClick={() => stylesInputRef.current?.click()}
              disabled={stylesUploading}
              className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition-colors disabled:opacity-40"
            >
              {stylesUploading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Upload className="w-3.5 h-3.5" />
              }
              {stylesUploading ? 'Subiendo…' : 'Agregar'}
            </button>
          </div>
          <p className="text-xs text-neutral-400 -mt-2">
            La IA adapta el estilo visual, paleta y atmósfera de cada imagen generada para que coincidan con estas referencias.
          </p>
          <input
            ref={stylesInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => handleUpload(e.target.files, 'style')}
          />

          {styles.length === 0 && !stylesUploading && (
            <button
              onClick={() => stylesInputRef.current?.click()}
              className="w-full border-2 border-dashed border-neutral-200 rounded-xl px-8 py-10 text-center hover:border-neutral-400 transition-colors"
            >
              <ImageIcon className="w-6 h-6 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500 mb-1">Sin referencias de estilo</p>
              <p className="text-xs text-neutral-300">Fotografías de inspiración, mood board, renders de amenidades</p>
            </button>
          )}

          {styles.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {styles.map(img => (
                <div key={img.id} className="relative group rounded-xl overflow-hidden border border-neutral-200 aspect-square bg-neutral-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => handleDelete(img.id)}
                    disabled={deletingId === img.id}
                    className="absolute top-2 right-2 p-1 bg-white border border-neutral-200 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:border-neutral-400 disabled:opacity-50"
                    aria-label="Eliminar referencia de estilo"
                  >
                    {deletingId === img.id
                      ? <Loader2 className="w-3 h-3 animate-spin text-neutral-500" />
                      : <X className="w-3 h-3 text-neutral-600" />
                    }
                  </button>
                </div>
              ))}
            </div>
          )}

          {styleError && <p className="text-xs text-red-500">{styleError}</p>}
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
