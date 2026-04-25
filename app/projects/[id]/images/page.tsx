'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Tag } from 'lucide-react';
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

export default function ProjectImagesPage() {
  const params = useParams();
  const projectId = params.id as string;
  type ImageGroup = {
    root: Image;
    versions: Image[];
  };
  const [images, setImages] = useState<ImageGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [assigningImageId, setAssigningImageId] = useState<string | null>(null);

  const fetchImages = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/images?project_id=${projectId}`);
      const data = await response.json();
      
      // Get all images (original and enhanced)
      const allImages = data.images || [];
      
      // Group by root image (original or first enhanced if no original)
      // Images with parent_image_id are versions, others are originals
      const rootImages = allImages.filter((img: Image) => !img.parent_image_id);
      
      // For each root, get all its versions
      const imageGroups = rootImages.map((root: Image) => {
        const versions = allImages.filter(
          (img: Image) => img.parent_image_id === root.id || img.id === root.id
        );
        return {
          root,
          versions: versions.sort((a: Image, b: Image) => {
            // Original first, then by created_at
            if (a.image_type === 'original') return -1;
            if (b.image_type === 'original') return 1;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          }),
        };
      });
      
      setImages(imageGroups);
      
      // Select first image group's first enhanced version (or original if no enhanced)
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

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

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
        <div className="mb-8">
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Proyecto
          </Link>
          <h1 className="text-3xl font-light text-gray-900 mb-2">Comparación de Imágenes</h1>
          <p className="text-sm text-gray-500">Compara las imágenes originales con las versiones mejoradas</p>
        </div>

        {images.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No se encontraron imágenes para este proyecto</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Image Groups List */}
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
                      // Select the first enhanced version, or original if none
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
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imageUrl}
                            alt={`Imagen ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                          Sin imagen
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="text-xs font-medium text-gray-900 mb-1">
                        Imagen {index + 1}
                      </div>
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
        )}

        {/* Space Assignment Modal */}
        {assigningImageId && (
          <ImageSpaceAssignment
            imageId={assigningImageId}
            projectId={projectId}
            onClose={() => setAssigningImageId(null)}
            onAssigned={() => {
              // Refresh if needed
              setAssigningImageId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

