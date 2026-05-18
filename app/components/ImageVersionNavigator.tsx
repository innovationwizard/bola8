'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Download, Sparkles, Palette, Sun, Wand2, Clock, Plus, RefreshCw, ThumbsDown, Frown, Meh, Smile, ThumbsUp, ImageIcon, Upload, X, Loader2 } from 'lucide-react';

interface ImageVersion {
  id: string;
  version: number;
  isOriginal: boolean;
  enhanced_url: string | null;
  original_url: string | null;
  enhancement_type: 'general' | 'targeted' | 'color' | 'lighting' | 'elements' | null;
  enhancement_metadata: Record<string, unknown> | null;
  created_at: string;
  filename: string | null;
  rating: number | null;
  liked_aspects: string | null;
  improvement_notes: string | null;
  reference_image_id: string | null;
}

interface ProjectRefImage {
  id: string;
  url: string;
  storage_path: string;
}

interface ImageVersionNavigatorProps {
  imageId: string;
  projectId: string;
  className?: string;
}

const ENHANCEMENT_TYPE_LABELS: Record<string, string> = {
  general: 'Mejora General',
  targeted: 'Reemplazo de Material',
  color: 'Reemplazo de Color',
  lighting: 'Control de Iluminación',
  elements: 'Agregar Elementos',
};

const ENHANCEMENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  general: <Sparkles className="w-4 h-4" />,
  targeted: <Wand2 className="w-4 h-4" />,
  color: <Palette className="w-4 h-4" />,
  lighting: <Sun className="w-4 h-4" />,
  elements: <Plus className="w-4 h-4" />,
};

const RATINGS = [
  { value: 1, label: 'Muy mala',  Icon: ThumbsDown },
  { value: 2, label: 'Mala',      Icon: Frown      },
  { value: 3, label: 'Regular',   Icon: Meh        },
  { value: 4, label: 'Buena',     Icon: Smile      },
  { value: 5, label: 'Muy buena', Icon: ThumbsUp   },
];

interface FeedbackDraft {
  rating: number | null;
  liked: string;
  improve: string;
  referenceImageId: string | null;
}

export default function ImageVersionNavigator({ imageId, projectId, className = '' }: ImageVersionNavigatorProps) {
  const [versions, setVersions]           = useState<ImageVersion[]>([]);
  const [currentIndex, setCurrentIndex]   = useState(0);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [draft, setDraft]                 = useState<FeedbackDraft>({ rating: null, liked: '', improve: '', referenceImageId: null });
  const [regenerating, setRegenerating]   = useState(false);
  const [regenError, setRegenError]       = useState<string | null>(null);

  const [projectRefs, setProjectRefs]     = useState<ProjectRefImage[]>([]);
  const [refUploading, setRefUploading]   = useState(false);
  const [refUploadError, setRefUploadError] = useState<string | null>(null);
  const refFileInputRef                   = useRef<HTMLInputElement>(null);

  const fetchVersions = useCallback(async (): Promise<ImageVersion[]> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/images/${imageId}/versions`);
      if (!response.ok) throw new Error('Failed to fetch versions');
      const data = await response.json();
      const vs: ImageVersion[] = data.versions || [];
      setVersions(vs);
      const idx = vs.findIndex((v) => v.id === imageId);
      setCurrentIndex(idx >= 0 ? idx : vs.length - 1);
      return vs;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return [];
    } finally {
      setLoading(false);
    }
  }, [imageId]);

  const fetchProjectRefs = useCallback(async () => {
    try {
      const res  = await fetch(`/api/projects/${projectId}/reference-images`);
      const data = await res.json();
      setProjectRefs(data.referenceImages ?? []);
    } catch {
      // Non-fatal — reference image picker degrades gracefully
    }
  }, [projectId]);

  useEffect(() => { fetchVersions(); }, [fetchVersions]);
  useEffect(() => { fetchProjectRefs(); }, [fetchProjectRefs]);

  // Pre-populate draft when navigating to a version that already has feedback.
  useEffect(() => {
    const v = versions[currentIndex];
    if (!v) return;
    setDraft({
      rating:           v.rating ?? null,
      liked:            v.liked_aspects ?? '',
      improve:          v.improvement_notes ?? '',
      referenceImageId: v.reference_image_id ?? null,
    });
    setRegenError(null);
    setRefUploadError(null);
  }, [currentIndex, versions]);

  const currentVersion = versions[currentIndex];
  const hasPrevious    = currentIndex > 0;
  const hasNext        = currentIndex < versions.length - 1;

  const goToPrevious = () => { if (hasPrevious) setCurrentIndex(currentIndex - 1); };
  const goToNext     = () => { if (hasNext)      setCurrentIndex(currentIndex + 1); };
  const goToVersion  = (i: number) => { if (i >= 0 && i < versions.length) setCurrentIndex(i); };

  const getImageUrl     = (v: ImageVersion) => `/api/images/${v.id}/file`;
  const getVersionLabel = (v: ImageVersion) => (v.isOriginal || v.version === 0) ? 'Original' : `Versión ${v.version}`;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const handleRefImageUpload = async (file: File) => {
    setRefUploading(true);
    setRefUploadError(null);
    try {
      // 1 — get signed URL (saves to project reference images library)
      const urlRes = await fetch(`/api/projects/${projectId}/reference-images/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      });
      if (!urlRes.ok) throw new Error('No se pudo obtener la URL de carga');
      const { signedUrl, path } = await urlRes.json();

      // 2 — PUT directly to Supabase
      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error('Error al subir la imagen');

      // 3 — save record to project reference images library
      const saveRes = await fetch(`/api/projects/${projectId}/reference-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: path }),
      });
      if (!saveRes.ok) throw new Error('Error al guardar la imagen de referencia');
      const { referenceImage } = await saveRes.json();

      // 4 — add to local list and auto-select
      setProjectRefs(prev => [...prev, referenceImage]);
      setDraft(d => ({ ...d, referenceImageId: referenceImage.id }));
    } catch (err) {
      setRefUploadError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setRefUploading(false);
      if (refFileInputRef.current) refFileInputRef.current.value = '';
    }
  };

  const handleRegenerate = async () => {
    if (!currentVersion || !draft.rating) return;
    setRegenerating(true);
    setRegenError(null);
    try {
      // 1 — persist feedback (including optional reference image)
      const fbRes = await fetch(`/api/images/${currentVersion.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating:             draft.rating,
          liked_aspects:      draft.liked,
          improvement_notes:  draft.improve,
          reference_image_id: draft.referenceImageId,
        }),
      });
      if (!fbRes.ok) throw new Error('No se pudo guardar el feedback');

      // 2 — regenerate using accumulated feedback + reference images
      const rgRes = await fetch(`/api/images/${currentVersion.id}/regenerate`, { method: 'POST' });
      if (!rgRes.ok) {
        const err = await rgRes.json().catch(() => ({}));
        throw new Error(err.error || 'La regeneración falló');
      }

      // 3 — reload all versions and jump to the newest one
      const updated = await fetchVersions();
      setCurrentIndex(updated.length - 1);
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <p className="text-sm text-gray-400">Cargando versiones...</p>
    </div>
  );

  if (error) return (
    <div className={`text-center py-12 ${className}`}>
      <p className="text-sm text-red-500">{error}</p>
    </div>
  );

  if (versions.length === 0) return (
    <div className={`text-center py-12 ${className}`}>
      <p className="text-sm text-gray-400">No se encontraron versiones</p>
    </div>
  );

  const selectedRef = projectRefs.find(r => r.id === draft.referenceImageId);

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>

      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-900">{getVersionLabel(currentVersion)}</span>
            {currentVersion.enhancement_type && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                {ENHANCEMENT_TYPE_ICONS[currentVersion.enhancement_type]}
                {ENHANCEMENT_TYPE_LABELS[currentVersion.enhancement_type]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(currentVersion.created_at)}
            </span>
            <a
              href={getImageUrl(currentVersion)}
              download={currentVersion.filename || `imagen-${currentVersion.id}.jpg`}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar
            </a>
          </div>
        </div>
      </div>

      {/* Image */}
      <div className="relative bg-gray-50">
        <div className="aspect-video flex items-center justify-center p-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getImageUrl(currentVersion)}
            alt={getVersionLabel(currentVersion)}
            className="max-w-full max-h-full object-contain rounded"
          />
        </div>

        {versions.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              disabled={!hasPrevious}
              className={`absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white border border-gray-200 shadow-sm transition-all ${hasPrevious ? 'hover:border-gray-300 text-gray-700' : 'opacity-30 cursor-not-allowed text-gray-300'}`}
              aria-label="Versión anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goToNext}
              disabled={!hasNext}
              className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white border border-gray-200 shadow-sm transition-all ${hasNext ? 'hover:border-gray-300 text-gray-700' : 'opacity-30 cursor-not-allowed text-gray-300'}`}
              aria-label="Versión siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Feedback panel — skipped for the original upload */}
      {!currentVersion.isOriginal && (
        <div className="px-6 py-6 border-t border-gray-100 space-y-5">

          {/* 1 — Rating */}
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-gray-400 mb-3">¿Cómo quedó esta imagen?</p>
            <div className="flex items-center gap-2">
              {RATINGS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => setDraft(d => ({ ...d, rating: value }))}
                  className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs transition-all ${
                    draft.rating === value
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 text-gray-500 hover:border-gray-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2 — Liked */}
          <div>
            <label className="block text-xs uppercase tracking-[0.15em] text-gray-400 mb-2">
              ¿Qué te gustó?
            </label>
            <textarea
              value={draft.liked}
              onChange={e => setDraft(d => ({ ...d, liked: e.target.value }))}
              placeholder="Los colores, la iluminación, la composición…"
              rows={2}
              className="w-full text-sm text-gray-700 placeholder-gray-300 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-gray-400 transition-colors"
            />
          </div>

          {/* 3 — Improve */}
          <div>
            <label className="block text-xs uppercase tracking-[0.15em] text-gray-400 mb-2">
              ¿Qué necesita mejorar?
            </label>
            <textarea
              value={draft.improve}
              onChange={e => setDraft(d => ({ ...d, improve: e.target.value }))}
              placeholder="El fondo se ve artificial, necesita más profundidad…"
              rows={2}
              className="w-full text-sm text-gray-700 placeholder-gray-300 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-gray-400 transition-colors"
            />
          </div>

          {/* 4 — Reference image (optional) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs uppercase tracking-[0.15em] text-gray-400">
                Imagen de referencia — opcional
              </label>
              <div className="flex items-center gap-2">
                {selectedRef && (
                  <button
                    onClick={() => setDraft(d => ({ ...d, referenceImageId: null }))}
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Quitar
                  </button>
                )}
                <button
                  onClick={() => refFileInputRef.current?.click()}
                  disabled={refUploading}
                  className="text-xs text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1 disabled:opacity-40"
                >
                  {refUploading
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Upload className="w-3 h-3" />
                  }
                  {refUploading ? 'Subiendo…' : 'Subir nueva'}
                </button>
                <input
                  ref={refFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleRefImageUpload(e.target.files[0]); }}
                />
              </div>
            </div>

            <p className="text-xs text-gray-400 mb-3">
              Si esta imagen no se parece a lo que buscas, selecciona o sube una referencia visual.
            </p>

            {projectRefs.length === 0 && !refUploading && (
              <button
                onClick={() => refFileInputRef.current?.click()}
                className="w-full border border-dashed border-gray-200 rounded-lg px-4 py-4 flex items-center justify-center gap-2 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors"
              >
                <ImageIcon className="w-4 h-4" />
                Sin imágenes de referencia — clic para subir una
              </button>
            )}

            {projectRefs.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {projectRefs.map(ref => {
                  const isSelected = draft.referenceImageId === ref.id;
                  return (
                    <button
                      key={ref.id}
                      onClick={() => setDraft(d => ({
                        ...d,
                        referenceImageId: d.referenceImageId === ref.id ? null : ref.id,
                      }))}
                      className={`flex-shrink-0 relative rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected
                          ? 'border-gray-900 ring-2 ring-gray-900 ring-offset-1'
                          : 'border-transparent opacity-60 hover:opacity-100 hover:border-gray-300'
                      }`}
                      title={isSelected ? 'Quitar selección' : 'Usar como referencia'}
                    >
                      <div className="w-16 h-16 bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ref.url} alt="" className="w-full h-full object-cover" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {refUploadError && (
              <p className="text-xs text-red-500 mt-2">{refUploadError}</p>
            )}
          </div>

          {/* 5 — Action row */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleRegenerate}
              disabled={!draft.rating || regenerating}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-sm rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
              {regenerating ? 'Generando nueva versión…' : 'Regenerar'}
            </button>
            {!draft.rating && (
              <span className="text-xs text-gray-400">Selecciona una calificación primero</span>
            )}
          </div>

          {regenError && (
            <p className="text-xs text-red-500">{regenError}</p>
          )}
        </div>
      )}

      {/* Thumbnails */}
      {versions.length > 1 && (
        <div className="px-6 py-4 border-t border-gray-100">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {versions.map((version, index) => {
              const isActive  = index === currentIndex;
              const imageUrl  = getImageUrl(version);
              const hasRating = version.rating != null;
              return (
                <button
                  key={version.id}
                  onClick={() => goToVersion(index)}
                  className={`flex-shrink-0 relative group transition-all ${isActive ? 'ring-2 ring-gray-900' : 'opacity-60 hover:opacity-100'}`}
                >
                  <div className="w-16 h-16 rounded border border-gray-200 overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt={getVersionLabel(version)} className="w-full h-full object-cover" />
                  </div>
                  {hasRating && (() => {
                    const R = RATINGS.find(r => r.value === version.rating);
                    return R ? (
                      <span className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 rounded-full p-0.5 shadow-sm">
                        <R.Icon className="w-3 h-3 text-gray-600" />
                      </span>
                    ) : null;
                  })()}
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-gray-900 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Metadata */}
      {currentVersion.enhancement_metadata && (
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="text-xs text-gray-500 space-y-1">
            {Array.isArray(currentVersion.enhancement_metadata.replacements) && (
              <div>
                <span className="font-medium">Reemplazos:</span>{' '}
                {(currentVersion.enhancement_metadata.replacements as Record<string, unknown>[])
                  .map((r) => (r.toMaterialName || r.toColor || 'N/A') as string)
                  .join(', ')}
              </div>
            )}
            {!!currentVersion.enhancement_metadata.lightingConfig && (
              <div>
                <span className="font-medium">Iluminación:</span>{' '}
                {((currentVersion.enhancement_metadata.lightingConfig as Record<string, unknown[]>)?.lightSources as unknown[])?.length || 0} fuente(s) de luz
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
