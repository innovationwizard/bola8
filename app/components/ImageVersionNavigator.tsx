'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Download, Sparkles, Palette, Sun, Wand2, Clock, Plus, RefreshCw, ThumbsDown, Frown, Meh, Smile, ThumbsUp } from 'lucide-react';

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
}

interface ImageVersionNavigatorProps {
  imageId: string;
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
}

export default function ImageVersionNavigator({ imageId, className = '' }: ImageVersionNavigatorProps) {
  const [versions, setVersions]       = useState<ImageVersion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [draft, setDraft]             = useState<FeedbackDraft>({ rating: null, liked: '', improve: '' });
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError]   = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [imageId]);

  useEffect(() => { fetchVersions(); }, [fetchVersions]);

  // Pre-populate draft when navigating to a version that already has feedback.
  useEffect(() => {
    const v = versions[currentIndex];
    if (!v) return;
    setDraft({
      rating:  v.rating ?? null,
      liked:   v.liked_aspects ?? '',
      improve: v.improvement_notes ?? '',
    });
    setRegenError(null);
  }, [currentIndex, versions]);

  const currentVersion = versions[currentIndex];
  const hasPrevious    = currentIndex > 0;
  const hasNext        = currentIndex < versions.length - 1;

  const goToPrevious = () => { if (hasPrevious) setCurrentIndex(currentIndex - 1); };
  const goToNext     = () => { if (hasNext)      setCurrentIndex(currentIndex + 1); };
  const goToVersion  = (i: number) => { if (i >= 0 && i < versions.length) setCurrentIndex(i); };

  const getImageUrl    = (v: ImageVersion) => `/api/images/${v.id}/file`;
  const getVersionLabel = (v: ImageVersion) => (v.isOriginal || v.version === 0) ? 'Original' : `Versión ${v.version}`;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const handleRegenerate = async () => {
    if (!currentVersion || !draft.rating) return;
    setRegenerating(true);
    setRegenError(null);
    try {
      // 1 — persist the feedback for this version
      const fbRes = await fetch(`/api/images/${currentVersion.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: draft.rating, liked_aspects: draft.liked, improvement_notes: draft.improve }),
      });
      if (!fbRes.ok) throw new Error('No se pudo guardar el feedback');

      // 2 — regenerate from this version using accumulated feedback
      const rgRes = await fetch(`/api/images/${currentVersion.id}/regenerate`, { method: 'POST' });
      if (!rgRes.ok) {
        const err = await rgRes.json().catch(() => ({}));
        throw new Error(err.error || 'La regeneración falló');
      }

      // 3 — reload all versions and jump to the new one (last)
      await fetchVersions();
      // fetchVersions sets currentIndex to the initial imageId position;
      // after regen we want the newest version, which will be last.
      setCurrentIndex((prev) => {
        void prev; // will be overridden below
        return -1; // trigger the effect below
      });
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setRegenerating(false);
    }
  };

  // After fetchVersions resolves, jump to the latest version.
  useEffect(() => {
    if (currentIndex === -1 && versions.length > 0) {
      setCurrentIndex(versions.length - 1);
    }
  }, [currentIndex, versions]);

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

          {/* 4 — Action row */}
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
              const isActive   = index === currentIndex;
              const imageUrl   = getImageUrl(version);
              const hasRating  = version.rating != null;
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
