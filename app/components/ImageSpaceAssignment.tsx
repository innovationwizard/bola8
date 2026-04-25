'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Check, Loader2 } from 'lucide-react';

interface Space {
  id: string;
  name: string;
  description: string | null;
}

interface ImageSpaceAssignmentProps {
  imageId: string;
  projectId: string;
  onClose: () => void;
  onAssigned?: () => void;
}

export default function ImageSpaceAssignment({
  imageId,
  projectId,
  onClose,
  onAssigned,
}: ImageSpaceAssignmentProps) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSpaces = useCallback(async () => {
    try {
      const response = await fetch(`/api/spaces?project_id=${projectId}`);
      const data = await response.json();
      setSpaces(data.spaces || []);
    } catch (error) {
      console.error('Error fetching spaces:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchCurrentAssignments = useCallback(async () => {
    try {
      const response = await fetch(`/api/images/${imageId}/spaces`);
      const data = await response.json();
      setSelectedSpaceIds(data.spaces.map((s: Space) => s.id));
    } catch (error) {
      console.error('Error fetching current assignments:', error);
    }
  }, [imageId]);

  useEffect(() => {
    fetchSpaces();
    fetchCurrentAssignments();
  }, [fetchSpaces, fetchCurrentAssignments]);

  const handleToggleSpace = (spaceId: string) => {
    setSelectedSpaceIds((prev) =>
      prev.includes(spaceId)
        ? prev.filter((id) => id !== spaceId)
        : [...prev, spaceId]
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/images/${imageId}/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ space_ids: selectedSpaceIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error}`);
        return;
      }

      if (onAssigned) {
        onAssigned();
      }
      onClose();
    } catch (error) {
      console.error('Error assigning spaces:', error);
      alert('Error al asignar espacios');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Asignar a Espacios</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {spaces.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-4">
                Este proyecto no tiene espacios configurados.
              </p>
              <p className="text-xs text-gray-400">
                Los espacios se configuran al crear el proyecto.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {spaces.map((space) => (
                <label
                  key={space.id}
                  className="flex items-center gap-3 p-3 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedSpaceIds.includes(space.id)}
                    onChange={() => handleToggleSpace(space.id)}
                    className="rounded border-gray-300"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{space.name}</div>
                    {space.description && (
                      <div className="text-xs text-gray-500 mt-0.5">{space.description}</div>
                    )}
                  </div>
                  {selectedSpaceIds.includes(space.id) && (
                    <Check className="w-4 h-4 text-gray-900" />
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          {spaces.length > 0 && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Guardar
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

