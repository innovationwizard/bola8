'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Tag, Upload } from 'lucide-react';
import ImageVersionNavigator from '@/app/components/ImageVersionNavigator';
import ImageSpaceAssignment from '@/app/components/ImageSpaceAssignment';

type Image = {
  id: string;
  image_type: string;
  original_url: string | null;
  enhanced_url: string | null;
  filename: string | null;
  created_at: string;
  parent_image_id?: string | null;
};

type ImageGroup = {
  root: Image;
  versions: Image[];
};

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; done: number; total: number; currentFile: string }
  | { status: 'done'; count: number }
  | { status: 'error'; message: string };

export default function ProjectImagesPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [images, setImages] = useState<ImageGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [assigningImageId, setAssigningImageId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/images?project_id=${projectId}`);
      const data = await response.json();
      const allImages = data.images || [];
      const rootImages = allImages.filter((img: Image) => !img.parent_image_id);
      const imageGroups = rootImages.map((root: Image) => {
        const versions = allImages.filter(
          (img: Image) => img.parent_image_id === root.id || img.id === root.id
        );
        return {
          root,
          versions: versions.sort((a: Image, b: Image) => {
            if (a.image_type === 'original') return -1;
            if (b.image_type === 'original') return 1;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          }),
        };
      });
      setImages(imageGroups);
      if (imageGroups.length > 0) {
        const firstGroup = imageGroups[0];
        const firstImage = firstGroup.versions.find((v: Image) => v.image_type === 'enhanced') || firstGroup.root;
        setSelectedImageId(firstImage.id);
      }
    } catch (error) {
      console.error('Error fetching images:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchImages(); }, [fetchImages]);

  const uploadFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setUploadState({ status: 'uploading', done: 0, total: imageFiles.length, currentFile: imageFiles[0].name });

    let successCount = 0;
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      setUploadState({ status: 'uploading', done: i, total: imageFiles.length, currentFile: file.name });
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('workflow_step', 'upload');
        const res = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: formData });
        if (res.ok) successCount++;
      } catch {
        // continue with remaining files
      }
    }

    setUploadState({ status: 'done', count: successCount });
    await fetchImages();
    setTimeout(() => setUploadState({ status: 'idle' }), 3000);
  }, [projectId, fetchImages]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) uploadFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) uploadFiles(Array.from(e.dataTransfer.files));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <p className="text-gray-500">Cargando imágenes...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-7xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Proyecto
          </Link>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-3xl font-light text-gray-900 mb-2">Fotos del Proyecto</h1>
              <p className="text-sm text-gray-500">Sube todas las fotos de la campaña y compáralas con las versiones mejoradas</p>
            </div>
            {images.length > 0 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadState.status === 'uploading'}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                Subir fotos
              </button>
            )}
          </div>
        </div>

        {/* Upload area — prominent when empty, compact when has images */}
        {images.length === 0 ? (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-colors ${
              dragging ? 'border-gray-400 bg-gray-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
            }`}
          >
            <Upload className="w-8 h-8 text-gray-300 mx-auto mb-4" />
            {uploadState.status === 'uploading' ? (
              <>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Subiendo {uploadState.done + 1} de {uploadState.total}...
                </p>
                <p className="text-xs text-gray-400">{uploadState.currentFile}</p>
              </>
            ) : uploadState.status === 'done' ? (
              <p className="text-sm text-gray-600">{uploadState.count} foto{uploadState.count !== 1 ? 's' : ''} subida{uploadState.count !== 1 ? 's' : ''}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700 mb-1">Arrastra tus fotos aquí</p>
                <p className="text-xs text-gray-400">o haz clic para seleccionarlas — puedes subir todas a la vez</p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Inline upload progress / drop zone strip */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`mb-6 rounded-xl border border-dashed px-6 py-3 transition-colors ${
                dragging ? 'border-gray-400 bg-gray-50' : 'border-gray-200'
              }`}
            >
              {uploadState.status === 'uploading' ? (
                <p className="text-xs text-gray-500 text-center">
                  Subiendo {uploadState.done + 1} de {uploadState.total} — <span className="text-gray-700">{uploadState.currentFile}</span>
                </p>
              ) : uploadState.status === 'done' ? (
                <p className="text-xs text-gray-500 text-center">{uploadState.count} foto{uploadState.count !== 1 ? 's' : ''} agregada{uploadState.count !== 1 ? 's' : ''}</p>
              ) : (
                <p className="text-xs text-gray-400 text-center">Arrastra más fotos aquí para agregarlas</p>
              )}
            </div>

            {/* Gallery */}
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {images.map((group: ImageGroup, index: number) => {
                  const rootImage = group.root;
                  const hasVersions = group.versions.length > 1;
                  const previewImage = group.versions.find((v: Image) => v.enhanced_url) || rootImage;
                  const imageUrl = previewImage.enhanced_url || previewImage.original_url;
                  return (
                    <button
                      key={rootImage.id}
                      onClick={() => {
                        const firstEnhanced = group.versions.find((v: Image) => v.image_type === 'enhanced');
                        setSelectedImageId(firstEnhanced?.id || rootImage.id);
                      }}
                      className={`text-left bg-white rounded-lg border transition-all ${
                        selectedImageId && group.versions.some((v: Image) => v.id === selectedImageId)
                          ? 'border-gray-900 ring-1 ring-gray-900'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="aspect-video bg-gray-50 rounded-t-lg overflow-hidden">
                        {imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageUrl} alt={`Imagen ${index + 1}`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Sin imagen</div>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="text-xs font-medium text-gray-900 mb-1">Imagen {index + 1}</div>
                        <div className="text-xs text-gray-500">
                          {hasVersions ? `${group.versions.length} versión${group.versions.length > 1 ? 'es' : ''}` : '1 versión'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Version Navigator */}
              {selectedImageId && (
                <div className="space-y-4">
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => setAssigningImageId(selectedImageId)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      Asignar a Espacios
                    </button>
                  </div>
                  <ImageVersionNavigator imageId={selectedImageId} />
                </div>
              )}
            </div>
          </>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />

        {/* Space Assignment Modal */}
        {assigningImageId && (
          <ImageSpaceAssignment
            imageId={assigningImageId}
            projectId={projectId}
            onClose={() => setAssigningImageId(null)}
            onAssigned={() => setAssigningImageId(null)}
          />
        )}
      </div>
    </div>
  );
}
