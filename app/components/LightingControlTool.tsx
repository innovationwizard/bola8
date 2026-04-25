'use client';

import { useState } from 'react';
import { Plus, X, Sun, Loader2, Minus } from 'lucide-react';

interface LightSource {
  id: string;
  type: 'natural' | 'artificial' | 'ambient';
  position: {
    x: number; // -100 to 100 (left to right)
    y: number; // -100 to 100 (bottom to top)
    z: number; // -100 to 100 (back to front)
  };
  strength: number; // 0 to 100
  warmth: number; // 0 (cool) to 100 (warm)
  color: string; // Hex color
  enabled: boolean;
}

interface LightingControlToolProps {
  onEnhance: (lightingConfig: {
    lightSources: Array<{
      type: string;
      position: { x: number; y: number; z: number };
      strength: number;
      warmth: number;
      color: string;
    }>;
    overallWarmth: number;
    overallBrightness: number;
  }) => Promise<void>;
  isProcessing?: boolean;
}

export default function LightingControlTool({
  onEnhance,
  isProcessing = false,
}: LightingControlToolProps) {
  const [lightSources, setLightSources] = useState<LightSource[]>([
    {
      id: '1',
      type: 'natural',
      position: { x: 0, y: 50, z: 0 },
      strength: 70,
      warmth: 60,
      color: '#FFF8E1',
      enabled: true,
    },
  ]);
  
  const [overallWarmth, setOverallWarmth] = useState(50);
  const [overallBrightness, setOverallBrightness] = useState(50);

  const addLightSource = () => {
    setLightSources([
      ...lightSources,
      {
        id: Date.now().toString(),
        type: 'artificial',
        position: { x: 0, y: 0, z: 0 },
        strength: 50,
        warmth: 50,
        color: '#FFFFFF',
        enabled: true,
      },
    ]);
  };

  const removeLightSource = (id: string) => {
    if (lightSources.length > 1) {
      setLightSources(lightSources.filter(l => l.id !== id));
    }
  };

  const updateLightSource = (id: string, updates: Partial<LightSource>) => {
    setLightSources(
      lightSources.map(l => (l.id === id ? { ...l, ...updates } : l))
    );
  };

  const handleEnhance = async () => {
    const enabledLights = lightSources.filter(l => l.enabled);
    
    if (enabledLights.length === 0) {
      alert('Por favor, habilita al menos una fuente de luz');
      return;
    }

    await onEnhance({
      lightSources: enabledLights.map(l => ({
        type: l.type,
        position: l.position,
        strength: l.strength,
        warmth: l.warmth,
        color: l.color,
      })),
      overallWarmth,
      overallBrightness,
    });
  };

  const lightTypeLabels = {
    natural: 'Natural',
    artificial: 'Artificial',
    ambient: 'Ambiente',
  };

  const warmthLabels = {
    0: 'Muy Fría',
    25: 'Fría',
    50: 'Neutra',
    75: 'Cálida',
    100: 'Muy Cálida',
  };

  const getWarmthLabel = (value: number) => {
    const closest = Object.keys(warmthLabels).reduce((prev, curr) =>
      Math.abs(parseInt(curr) - value) < Math.abs(parseInt(prev) - value) ? curr : prev
    );
    return warmthLabels[parseInt(closest) as keyof typeof warmthLabels];
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Sun className="w-5 h-5" />
          Control de Iluminación
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          Ajusta las fuentes de luz, su posición, intensidad, temperatura y color.
        </p>

        {/* Overall Controls */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
          <h4 className="text-sm font-medium text-gray-700">Ajustes Generales</h4>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Brillo General
              </label>
              <span className="text-sm text-gray-500">{overallBrightness}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={overallBrightness}
              onChange={(e) => setOverallBrightness(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Temperatura General
              </label>
              <span className="text-sm text-gray-500">{getWarmthLabel(overallWarmth)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={overallWarmth}
              onChange={(e) => setOverallWarmth(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Fría (Azul)</span>
              <span>Cálida (Ámbar)</span>
            </div>
          </div>
        </div>

        {/* Light Sources */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-gray-700">
              Fuentes de Luz ({lightSources.filter(l => l.enabled).length} activas)
            </h4>
            <button
              type="button"
              onClick={addLightSource}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <Plus className="w-4 h-4" />
              Agregar Luz
            </button>
          </div>

          {lightSources.map((light, index) => (
            <div
              key={light.id}
              className="border border-gray-200 rounded-lg p-4 bg-gray-50"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={light.enabled}
                    onChange={(e) =>
                      updateLightSource(light.id, { enabled: e.target.checked })
                    }
                    className="w-4 h-4 text-gray-600 rounded focus:ring-gray-500"
                  />
                  <h5 className="text-sm font-medium text-gray-700">
                    Luz {index + 1}
                  </h5>
                </div>
                {lightSources.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLightSource(light.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {light.enabled && (
                <div className="space-y-4">
                  {/* Light Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo de Luz
                    </label>
                    <div className="flex gap-2">
                      {(['natural', 'artificial', 'ambient'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => updateLightSource(light.id, { type })}
                          className={`px-3 py-1.5 text-sm rounded-md ${
                            light.type === type
                              ? 'bg-gray-900 text-white'
                              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {lightTypeLabels[type]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Position (3D) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Posición 3D
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">X (Izq/Der)</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateLightSource(light.id, {
                                position: { ...light.position, x: Math.max(-100, light.position.x - 10) },
                              })
                            }
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="-100"
                            max="100"
                            value={light.position.x}
                            onChange={(e) =>
                              updateLightSource(light.id, {
                                position: { ...light.position, x: parseInt(e.target.value) || 0 },
                              })
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateLightSource(light.id, {
                                position: { ...light.position, x: Math.min(100, light.position.x + 10) },
                              })
                            }
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Y (Abajo/Arriba)</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateLightSource(light.id, {
                                position: { ...light.position, y: Math.max(-100, light.position.y - 10) },
                              })
                            }
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="-100"
                            max="100"
                            value={light.position.y}
                            onChange={(e) =>
                              updateLightSource(light.id, {
                                position: { ...light.position, y: parseInt(e.target.value) || 0 },
                              })
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateLightSource(light.id, {
                                position: { ...light.position, y: Math.min(100, light.position.y + 10) },
                              })
                            }
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Z (Atrás/Adelante)</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateLightSource(light.id, {
                                position: { ...light.position, z: Math.max(-100, light.position.z - 10) },
                              })
                            }
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="-100"
                            max="100"
                            value={light.position.z}
                            onChange={(e) =>
                              updateLightSource(light.id, {
                                position: { ...light.position, z: parseInt(e.target.value) || 0 },
                              })
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateLightSource(light.id, {
                                position: { ...light.position, z: Math.min(100, light.position.z + 10) },
                              })
                            }
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Strength */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700">
                        Intensidad
                      </label>
                      <span className="text-sm text-gray-500">{light.strength}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={light.strength}
                      onChange={(e) =>
                        updateLightSource(light.id, { strength: parseInt(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>

                  {/* Warmth */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700">
                        Temperatura
                      </label>
                      <span className="text-sm text-gray-500">{getWarmthLabel(light.warmth)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={light.warmth}
                      onChange={(e) =>
                        updateLightSource(light.id, { warmth: parseInt(e.target.value) })
                      }
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>Fría</span>
                      <span>Cálida</span>
                    </div>
                  </div>

                  {/* Color */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Color de la Luz
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={light.color}
                        onChange={(e) =>
                          updateLightSource(light.id, { color: e.target.value })
                        }
                        className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={light.color}
                        onChange={(e) =>
                          updateLightSource(light.id, { color: e.target.value })
                        }
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Vista previa:</span>
                      <div
                        className="w-8 h-8 rounded border border-gray-300"
                        style={{ backgroundColor: light.color }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action Button */}
      <div className="flex justify-end">
        <button
          onClick={handleEnhance}
          disabled={isProcessing || lightSources.filter(l => l.enabled).length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <Sun className="w-5 h-5" />
              Aplicar Iluminación
            </>
          )}
        </button>
      </div>
    </div>
  );
}

