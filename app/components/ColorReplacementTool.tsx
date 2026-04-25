'use client';

import { useState } from 'react';
import { Plus, X, Loader2, Palette } from 'lucide-react';

interface ColorReplacement {
  id: string;
  targetElement: string;
  fromColor: string | null;
  toColor: string;
}

interface ColorReplacementToolProps {
  onEnhance: (replacements: Array<{
    targetElement: string;
    fromColor: string | null;
    toColor: string;
  }>) => Promise<void>;
  isProcessing?: boolean;
}

export default function ColorReplacementTool({
  onEnhance,
  isProcessing = false,
}: ColorReplacementToolProps) {
  const [replacements, setReplacements] = useState<ColorReplacement[]>([
    { id: '1', targetElement: '', fromColor: null, toColor: '#808080' },
  ]);

  const addReplacement = () => {
    setReplacements([
      ...replacements,
      { id: Date.now().toString(), targetElement: '', fromColor: null, toColor: '#808080' },
    ]);
  };

  const removeReplacement = (id: string) => {
    setReplacements(replacements.filter(r => r.id !== id));
  };

  const updateReplacement = (id: string, updates: Partial<ColorReplacement>) => {
    setReplacements(
      replacements.map(r => (r.id === id ? { ...r, ...updates } : r))
    );
  };

  const handleEnhance = async () => {
    const validReplacements = replacements.filter(
      r => r.targetElement && r.toColor
    );

    if (validReplacements.length === 0) {
      alert('Por favor, completa al menos un cambio de color');
      return;
    }

    const replacementsPayload = validReplacements.map(r => ({
      targetElement: r.targetElement,
      fromColor: r.fromColor,
      toColor: r.toColor,
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

  const presetColors = [
    { name: 'Blanco', value: '#FFFFFF' },
    { name: 'Negro', value: '#000000' },
    { name: 'Gris Claro', value: '#E5E5E5' },
    { name: 'Gris', value: '#808080' },
    { name: 'Gris Oscuro', value: '#404040' },
    { name: 'Beige', value: '#F5F5DC' },
    { name: 'Marrón Claro', value: '#D4A574' },
    { name: 'Marrón', value: '#8B4513' },
    { name: 'Marrón Oscuro', value: '#654321' },
    { name: 'Azul Claro', value: '#87CEEB' },
    { name: 'Azul', value: '#4169E1' },
    { name: 'Verde Claro', value: '#90EE90' },
    { name: 'Verde', value: '#228B22' },
    { name: 'Rojo', value: '#DC143C' },
    { name: 'Rojo Oscuro', value: '#8B0000' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Palette className="w-5 h-5" />
          Cambio de Color
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          Cambia el color de elementos específicos. Selecciona el elemento y elige el color nuevo.
        </p>

        <div className="space-y-4">
          {replacements.map((replacement, index) => (
            <div
              key={replacement.id}
              className="border border-gray-200 rounded-lg p-4 bg-gray-50"
            >
              <div className="flex items-start justify-between mb-4">
                <h4 className="text-sm font-medium text-gray-700">
                  Cambio {index + 1}
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

                {/* From Color (Optional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Color Actual (Opcional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={replacement.fromColor || '#FFFFFF'}
                      onChange={(e) =>
                        updateReplacement(replacement.id, { fromColor: e.target.value })
                      }
                      className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      placeholder="#FFFFFF"
                      value={replacement.fromColor || ''}
                      onChange={(e) =>
                        updateReplacement(replacement.id, { fromColor: e.target.value || null })
                      }
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateReplacement(replacement.id, { fromColor: null })
                      }
                      className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Limpiar
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Deja vacío si no conoces el color actual
                  </p>
                </div>

                {/* To Color (Required) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Color Nuevo *
                  </label>
                  
                  {/* Preset Colors */}
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-2">Colores Predefinidos:</p>
                    <div className="flex flex-wrap gap-2">
                      {presetColors.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() =>
                            updateReplacement(replacement.id, { toColor: preset.value })
                          }
                          className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border ${
                            replacement.toColor === preset.value
                              ? 'border-gray-900 bg-gray-100'
                              : 'border-gray-300 bg-white hover:bg-gray-50'
                          }`}
                        >
                          <div
                            className="w-4 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: preset.value }}
                          />
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Color Picker */}
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={replacement.toColor}
                      onChange={(e) =>
                        updateReplacement(replacement.id, { toColor: e.target.value })
                      }
                      className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      placeholder="#808080"
                      value={replacement.toColor}
                      onChange={(e) =>
                        updateReplacement(replacement.id, { toColor: e.target.value })
                      }
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                  
                  {/* Color Preview */}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-500">Vista previa:</span>
                    <div
                      className="w-8 h-8 rounded border border-gray-300"
                      style={{ backgroundColor: replacement.toColor }}
                    />
                    <span className="text-xs text-gray-600">{replacement.toColor}</span>
                  </div>
                </div>
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
          Agregar Otro Cambio de Color
        </button>
      </div>

      {/* Action Button */}
      <div className="flex justify-end">
        <button
          onClick={handleEnhance}
          disabled={
            isProcessing ||
            replacements.every(r => !r.targetElement || !r.toColor)
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
              <Palette className="w-5 h-5" />
              Aplicar Cambios de Color
            </>
          )}
        </button>
      </div>
    </div>
  );
}

