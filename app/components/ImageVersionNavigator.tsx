'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Download, Sparkles, Palette, Sun, Wand2, Clock, Plus } from 'lucide-react';

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

export default function ImageVersionNavigator({ imageId, className = '' }: ImageVersionNavigatorProps) {
  const [versions, setVersions] = useState<ImageVersion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/images/${imageId}/versions`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch versions');
      }

      const data = await response.json();
      setVersions(data.versions || []);
      
      // Find the current image in the versions array
      const currentIndex = data.versions.findIndex((v: ImageVersion) => v.id === imageId);
      setCurrentIndex(currentIndex >= 0 ? currentIndex : 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching versions:', err);
    } finally {
      setLoading(false);
    }
  }, [imageId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const currentVersion = versions[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < versions.length - 1;

  const goToPrevious = () => {
    if (hasPrevious) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (hasNext) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToVersion = (index: number) => {
    if (index >= 0 && index < versions.length) {
      setCurrentIndex(index);
    }
  };

  const getImageUrl = (version: ImageVersion) => {
    if (version.isOriginal) {
      return version.original_url;
    }
    return version.enhanced_url || version.original_url;
  };

  const getDownloadUrl = (version: ImageVersion) => {
    return getImageUrl(version);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getVersionLabel = (version: ImageVersion) => {
    if (version.isOriginal) {
      return 'Original';
    }
    return `Versión ${version.version}`;
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <div className="text-sm text-gray-400">Cargando versiones...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <p className="text-sm text-gray-400">No se encontraron versiones</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-gray-900">
              {getVersionLabel(currentVersion)}
            </div>
            {currentVersion.enhancement_type && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                {ENHANCEMENT_TYPE_ICONS[currentVersion.enhancement_type]}
                <span>{ENHANCEMENT_TYPE_LABELS[currentVersion.enhancement_type]}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatDate(currentVersion.created_at)}</span>
            </div>
            {getDownloadUrl(currentVersion) && (
              <a
                href={getDownloadUrl(currentVersion) || '#'}
                download
                className="text-xs text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                Descargar
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Image Display */}
      <div className="relative bg-gray-50">
        <div className="aspect-video flex items-center justify-center p-8">
          {getImageUrl(currentVersion) ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getImageUrl(currentVersion) || ''}
                alt={getVersionLabel(currentVersion)}
                className="max-w-full max-h-full object-contain rounded"
              />
            </>
          ) : (
            <div className="text-sm text-gray-400">Imagen no disponible</div>
          )}
        </div>

        {/* Navigation Arrows */}
        {versions.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              disabled={!hasPrevious}
              className={`absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white border border-gray-200 shadow-sm transition-all ${
                hasPrevious
                  ? 'hover:border-gray-300 hover:shadow text-gray-700'
                  : 'opacity-30 cursor-not-allowed text-gray-300'
              }`}
              aria-label="Versión anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goToNext}
              disabled={!hasNext}
              className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white border border-gray-200 shadow-sm transition-all ${
                hasNext
                  ? 'hover:border-gray-300 hover:shadow text-gray-700'
                  : 'opacity-30 cursor-not-allowed text-gray-300'
              }`}
              aria-label="Versión siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Version Thumbnails */}
      {versions.length > 1 && (
        <div className="px-6 py-4 border-t border-gray-100">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {versions.map((version, index) => {
              const isActive = index === currentIndex;
              const imageUrl = getImageUrl(version);
              
              return (
                <button
                  key={version.id}
                  onClick={() => goToVersion(index)}
                  className={`flex-shrink-0 relative group transition-all ${
                    isActive
                      ? 'ring-2 ring-gray-900'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="w-16 h-16 rounded border border-gray-200 overflow-hidden bg-gray-100">
                    {imageUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
                          alt={getVersionLabel(version)}
                          className="w-full h-full object-cover"
                        />
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                        {version.isOriginal ? 'O' : version.version}
                      </div>
                    )}
                  </div>
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-gray-900 rounded-full" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="text-xs font-medium text-white bg-black/50 px-2 py-0.5 rounded">
                      {getVersionLabel(version)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Metadata (if available) */}
      {currentVersion.enhancement_metadata && (
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="text-xs text-gray-500 space-y-1">
            {(currentVersion.enhancement_metadata.replacements && Array.isArray(currentVersion.enhancement_metadata.replacements)) ? (
              <div>
                <span className="font-medium">Reemplazos:</span>{' '}
                {currentVersion.enhancement_metadata.replacements
                  .map((r: Record<string, unknown>) => (r.toMaterialName || r.toColor || 'N/A') as string)
                  .join(', ')}
              </div>
            ) : null}
            {currentVersion.enhancement_metadata.lightingConfig ? (
              <div>
                <span className="font-medium">Iluminación:</span>{' '}
                {((currentVersion.enhancement_metadata.lightingConfig as Record<string, unknown>)?.lightSources as Array<unknown>)?.length || 0} fuente(s) de luz
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

