'use client';

import { useState } from 'react';
import { Material } from '@/lib/material-library';
import MaterialPicker from './MaterialPicker';
import { Plus, X, Wand2, Loader2 } from 'lucide-react';

interface Replacement {
  id: string;
  targetElement: string;
  fromMaterial: Material | null;
  toMaterial: Material | null;
}

interface MaterialReplacementToolProps {
  onEnhance: (replacements: Array<{
    targetElement: string;
    fromMaterialId: string | null;
    toMaterialId: string;
  }>) => Promise<void>;
  isProcessing?: boolean;
}

export default function MaterialReplacementTool({
  onEnhance,
  isProcessing = false,
}: MaterialReplacementToolProps) {
  const [replacements, setReplacements] = useState<Replacement[]>([
    { id: '1', targetElement: '', fromMaterial: null, toMaterial: null },
  ]);

  const addReplacement = () => {
    setReplacements([
      ...replacements,
      { id: Date.now().toString(), targetElement: '', fromMaterial: null, toMaterial: null },
    ]);
  };

  const removeReplacement = (id: string) => {
    setReplacements(replacements.filter(r => r.id !== id));
  };

  const updateReplacement = (id: string, updates: Partial<Replacement>) => {
    setReplacements(
      replacements.map(r => (r.id === id ? { ...r, ...updates } : r))
    );
  };

  const handleEnhance = async () => {
    // Validate all replacements
    const validReplacements = replacements.filter(
      r => r.targetElement && r.toMaterial
    );

    if (validReplacements.length === 0) {
      alert('Por favor, completa al menos un reemplazo de material');
      return;
    }

    const replacementsPayload = validReplacements.map(r => ({
      targetElement: r.targetElement,
      fromMaterialId: r.fromMaterial?.id || null,
      toMaterialId: r.toMaterial!.id,
    }));

    await onEnhance(replacementsPayload);
  };

  const commonElements = [
    'Piso',
    'Pared',
    'Silla',
    'Sofá',
    'Mesa',
    'Encimera',
    'Puerta',
    'Ventana',
    'Lámpara',
    'Alfombra',
    'Cortina',
    'Otro',
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Reemplazo de Materiales
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          Especifica qué elementos quieres cambiar y selecciona los materiales de origen y destino.
        </p>

        <div className="space-y-4">
          {replacements.map((replacement, index) => (
            <div
              key={replacement.id}
              className="border border-gray-200 rounded-lg p-4 bg-gray-50"
            >
              <div className="flex items-start justify-between mb-4">
                <h4 className="text-sm font-medium text-gray-700">
                  Reemplazo {index + 1}
                </h4>
                {replacements.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeReplacement(replacement.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {/* Target Element */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Elemento a Cambiar
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {commonElements.map((element) => (
                      <button
                        key={element}
                        type="button"
                        onClick={() =>
                          updateReplacement(replacement.id, { targetElement: element })
                        }
                        className={`px-3 py-1 text-sm rounded-md ${
                          replacement.targetElement === element
                            ? 'bg-gray-800 text-white'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {element}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="O escribe un elemento personalizado..."
                    value={replacement.targetElement}
                    onChange={(e) =>
                      updateReplacement(replacement.id, { targetElement: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                  />
                </div>

                {/* From Material (Optional) */}
                <MaterialPicker
                  label="Material Actual (Opcional)"
                  selectedMaterial={replacement.fromMaterial}
                  onSelect={(material) =>
                    updateReplacement(replacement.id, { fromMaterial: material })
                  }
                />

                {/* To Material (Required) */}
                <MaterialPicker
                  label="Material Nuevo *"
                  selectedMaterial={replacement.toMaterial}
                  onSelect={(material) =>
                    updateReplacement(replacement.id, { toMaterial: material })
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addReplacement}
          className="mt-4 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <Plus className="w-4 h-4" />
          Agregar Otro Reemplazo
        </button>
      </div>

      {/* Action Button */}
      <div className="flex justify-end">
        <button
          onClick={handleEnhance}
          disabled={
            isProcessing ||
            replacements.every(r => !r.targetElement || !r.toMaterial)
          }
          className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <Wand2 className="w-5 h-5" />
              Aplicar Cambios
            </>
          )}
        </button>
      </div>
    </div>
  );
}

