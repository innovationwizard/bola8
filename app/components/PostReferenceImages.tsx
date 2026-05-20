'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, X, Loader2, ImageIcon } from 'lucide-react';

const MAX_INSPO = 3;

interface InspoImage {
  id: string;
  url: string;
  storage_path: string;
  caption: string | null;
  display_order: number;
}

interface PostReferenceImagesProps {
  postId: string;
  projectId: string;
}

export default function PostReferenceImages({ postId, projectId: _projectId }: PostReferenceImagesProps) {
  const [images, setImages]       = useState<InspoImage[]>([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    try {
      const res  = await fetch(`/api/posts/${postId}/reference-images`);
      const data = await res.json();
      setImages(data.referenceImages ?? []);
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => { fetchImages(); }, [fetchImages]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (images.length >= MAX_INSPO) {
      setError(`Máximo ${MAX_INSPO} imágenes de inspiración por post`);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        if (images.length >= MAX_INSPO) break;

        // 1 — Get signed upload URL
        const urlRes = await fetch(`/api/posts/${postId}/reference-images/upload-url`, {
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
        if (!uploadRes.ok) throw new Error(`Error al subir "${file.name}"`);

        // 3 — Save record
        const saveRes = await fetch(`/api/posts/${postId}/reference-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath: path }),
        });
        if (!saveRes.ok) {
          const err = await saveRes.json().catch(() => ({}));
          throw new Error(err.error || 'Error al guardar la imagen');
        }
        const { referenceImage } = await saveRes.json();
        setImages(prev => [...prev, referenceImage]);
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
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/reference-images/${refId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      setImages(prev => prev.filter(img => img.id !== refId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const canUpload = images.length < MAX_INSPO;

  if (loading) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400">Pinterest Inspo</p>
          <p className="text-xs text-neutral-400 mt-0.5">
            {images.length}/{MAX_INSPO} — la IA les da más peso por ser específicas de este post
          </p>
        </div>
        {canUpload && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition-colors disabled:opacity-40"
          >
            {uploading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Upload className="w-3.5 h-3.5" />
            }
            {uploading ? 'Subiendo…' : 'Agregar'}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => handleUpload(e.target.files)}
      />

      {images.length === 0 && !uploading ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full border border-dashed border-neutral-200 rounded-xl px-6 py-8 flex flex-col items-center gap-2 hover:border-neutral-400 transition-colors"
        >
          <ImageIcon className="w-5 h-5 text-neutral-300" />
          <span className="text-xs text-neutral-400">
            Descarga imágenes de Pinterest y agrégalas aquí
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-2">
          {images.map(img => (
            <div
              key={img.id}
              className="relative group flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => handleDelete(img.id)}
                disabled={deletingId === img.id}
                className="absolute top-1 right-1 p-0.5 bg-white border border-neutral-200 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:border-neutral-400 disabled:opacity-50"
              >
                {deletingId === img.id
                  ? <Loader2 className="w-3 h-3 animate-spin text-neutral-500" />
                  : <X className="w-3 h-3 text-neutral-600" />
                }
              </button>
            </div>
          ))}

          {canUpload && uploading && (
            <div className="flex-shrink-0 w-20 h-20 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
            </div>
          )}

          {canUpload && !uploading && (
            <button
              onClick={() => inputRef.current?.click()}
              className="flex-shrink-0 w-20 h-20 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 flex items-center justify-center hover:border-neutral-400 transition-colors"
            >
              <Upload className="w-4 h-4 text-neutral-300" />
            </button>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
