'use client';

import { useState, useEffect } from 'react';
import { Upload, Star, TrendingUp } from 'lucide-react';

interface TrainingOption {
  option: string;
  url: string;
  image_id: number;
  parameters: {
    api: string;
    init_strength?: number;
    strength?: number;
    guidance_scale: number;
    controlnet_weight?: number;
    controlnet_conditioning_scale?: number;
  };
}

interface TrainingExperiment {
  experiment_id: string;
  options: TrainingOption[];
  original_url: string;
}

interface TrainingStatus {
  phase_1: {
    active: boolean;
    samples_collected: number;
    best_rating: number;
    convergence: number;
  };
  phase_2: {
    active: boolean;
    training_samples: number;
    ready_for_inference: boolean;
  };
  prompt_evolution: {
    current_version: string;
    last_evolution: string | null;
    next_evolution_at_sample: number;
  };
}

export default function TrainPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [experiment, setExperiment] = useState<TrainingExperiment | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load status on mount
  useEffect(() => {
    fetch('/api/train/status')
      .then(res => res.json())
      .then(setStatus)
      .catch(console.error);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setExperiment(null);
      setRatings({});
      setComments({});
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('mode', 'structure');

      const response = await fetch('/api/enhance/train', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al generar variantes');
      }

      const data = await response.json();
      setExperiment(data);

      // Refresh status
      const statusResponse = await fetch('/api/train/status');
      const statusData = await statusResponse.json();
      setStatus(statusData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleRatingChange = (option: string, rating: number) => {
    setRatings(prev => ({ ...prev, [option]: rating }));
  };

  const handleCommentChange = (option: string, comment: string) => {
    setComments(prev => ({ ...prev, [option]: comment }));
  };

  const handleSubmit = async () => {
    if (!experiment) return;

    // Validate all options are rated
    const allRated = experiment.options.every(opt => ratings[opt.option]);
    if (!allRated) {
      alert('Por favor califica todas las opciones');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/train/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          experiment_id: experiment.experiment_id,
          ratings: experiment.options.map(opt => ({
            option: opt.option,
            image_id: opt.image_id,
            rating: ratings[opt.option],
            comments: comments[opt.option] || '',
          })),
          rated_by: 'entrenador',
        }),
      });

      if (!response.ok) {
        throw new Error('Error al guardar calificaciones');
      }

      const result = await response.json();

      // Show success message
      alert(
        `✓ Calificaciones guardadas\n\n` +
        `Mejor calificación actual: ${result.current_best_rating?.toFixed(1) || 'N/A'}/5.0\n` +
        `Muestras recolectadas: ${result.samples_collected}`
      );

      // Reset for next image
      setSelectedFile(null);
      setPreviewUrl(null);
      setExperiment(null);
      setRatings({});
      setComments({});

      // Refresh status
      const statusResponse = await fetch('/api/train/status');
      const statusData = await statusResponse.json();
      setStatus(statusData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Entrenamiento 🤖 Sistema de Aprendizaje Profundo
          </h1>
          <p className="text-gray-600">
            Entrena al sistema para generar imágenes fotorrealistas
          </p>
        </div>

        {/* Status Panel */}
        {status && (() => {
          const totalSamples = status.phase_1.samples_collected + status.phase_2.training_samples;
          const getColorClasses = (samples: number) => {
            if (samples <= 50) {
              return {
                bg: 'bg-red-400',
                bgLight: 'bg-red-50',
                text: 'text-red-700',
                textDark: 'text-red-900',
                border: 'border-red-200',
              };
            } else if (samples < 200) {
              return {
                bg: 'bg-amber-400',
                bgLight: 'bg-amber-50',
                text: 'text-amber-700',
                textDark: 'text-amber-900',
                border: 'border-amber-200',
              };
            } else {
              return {
                bg: 'bg-green-400',
                bgLight: 'bg-green-50',
                text: 'text-green-700',
                textDark: 'text-green-900',
                border: 'border-green-200',
              };
            }
          };
          const colors = getColorClasses(totalSamples);
          return (
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className={`w-5 h-5 ${colors.text}`} />
                <h2 className="text-lg font-semibold">Estado del Entrenamiento</h2>
              </div>

              {/* Phase 1 Progress */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Fase 1: Optimización Bayesiana</span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      status.phase_1.active 
                        ? colors.bgLight + ' ' + colors.text
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {status.phase_1.active ? 'Activa' : 'Completa'}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {status.phase_1.samples_collected}/50 muestras
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${colors.bg}`}
                    style={{ width: `${Math.min((status.phase_1.samples_collected / 50) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Meta: 50 muestras</span>
                  <span>{Math.round((status.phase_1.samples_collected / 50) * 100)}% completado</span>
                </div>
              </div>

              {/* Phase 2 Progress */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Fase 2: Modelo de Recompensas Dinámicas</span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      status.phase_2.active 
                        ? colors.bgLight + ' ' + colors.text
                        : status.phase_2.ready_for_inference
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {status.phase_2.active 
                        ? 'Activa' 
                        : status.phase_2.ready_for_inference
                        ? 'Listo'
                        : 'Pendiente'}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {status.phase_2.training_samples}/200+ muestras
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${colors.bg}`}
                    style={{ width: `${Math.min((status.phase_2.training_samples / 200) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Meta: 200+ muestras</span>
                  <span>{Math.round((status.phase_2.training_samples / 200) * 100)}% completado</span>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className={`${colors.bgLight} rounded p-4`}>
                  <div className={`text-sm ${colors.text} font-medium mb-1`}>
                    Muestras Totales
                  </div>
                  <div className={`text-2xl font-bold ${colors.textDark}`}>
                    {totalSamples}
                  </div>
                  <div className={`text-xs ${colors.text} mt-1`}>
                    Fase 1: {status.phase_1.samples_collected} | Fase 2: {status.phase_2.training_samples}
                  </div>
                </div>

                <div className="bg-green-50 rounded p-4">
                  <div className="text-sm text-green-600 font-medium mb-1">
                    Mejor Calificación
                  </div>
                  <div className="text-2xl font-bold text-green-900">
                    {status.phase_1.best_rating?.toFixed(1) || 'N/A'}/5.0
                  </div>
                  <div className="text-xs text-green-600 mt-1">
                    Meta: ≥ 4.0/5.0
                  </div>
                </div>

                <div className="bg-purple-50 rounded p-4">
                  <div className="text-sm text-purple-600 font-medium mb-1">
                    Versión de Prompt
                  </div>
                  <div className="text-2xl font-bold text-purple-900">
                    {status.prompt_evolution.current_version}
                  </div>
                  <div className="text-xs text-purple-600 mt-1">
                    Próxima evolución: muestra {status.prompt_evolution.next_evolution_at_sample}
                  </div>
                </div>
              </div>

              {status.phase_1.convergence > 0 && (
                <div className="mt-4">
                  <div className="text-sm text-gray-600 mb-2">
                    Convergencia: {Math.round(status.phase_1.convergence * 100)}%
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${status.phase_1.convergence * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Cargar Imagen</h2>

          <div className="flex gap-4">
            <label className="flex-1 cursor-pointer">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-blue-400 transition-colors">
                <div className="flex flex-col items-center gap-2">
                  {previewUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-h-48 rounded"
                      />
                    </>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        Haz clic para seleccionar una imagen
                      </span>
                      <span className="text-xs text-gray-400">
                        JPG, PNG (máx. 10MB)
                      </span>
                    </>
                  )}
                </div>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </div>

          {selectedFile && !experiment && (
            <button
              onClick={handleUpload}
              disabled={loading}
              className="mt-4 w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading ? 'Generando variantes...' : 'Generar Variantes'}
            </button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Results Grid */}
        {experiment && (
          <div className="space-y-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">
                Califica las Variantes Generadas
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                Evalúa el fotorrealismo de cada opción. Considera: profundidad, iluminación, texturas y apariencia fotográfica.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {experiment.options.map((option) => (
                  <div key={option.option} className="border rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-semibold text-lg">Opción {option.option}</h3>
                      <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded">
                        {option.parameters.api === 'leonardo' ? 'Leonardo' : 'Stable Diffusion'}
                      </span>
                    </div>

                    {/* Image */}
                    <div className="mb-4 bg-gray-100 rounded overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={option.url}
                        alt={`Opción ${option.option}`}
                        className="w-full h-auto"
                      />
                    </div>

                    {/* Parameters */}
                    <div className="text-xs text-gray-600 mb-4 space-y-1">
                      <div>Init Strength: {option.parameters.init_strength || option.parameters.strength}</div>
                      <div>Guidance: {option.parameters.guidance_scale}</div>
                      <div>
                        ControlNet: {option.parameters.controlnet_weight || option.parameters.controlnet_conditioning_scale}
                      </div>
                    </div>

                    {/* Rating */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Calificación (1-5 estrellas)
                      </label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => handleRatingChange(option.option, star)}
                            className="transition-colors"
                          >
                            <Star
                              className={`w-8 h-8 ${
                                ratings[option.option] >= star
                                  ? 'fill-yellow-400 text-yellow-400'
                                  : 'text-gray-300'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      {ratings[option.option] && (
                        <div className="mt-2 text-sm text-gray-600">
                          Calificación: {ratings[option.option]}/5
                        </div>
                      )}
                    </div>

                    {/* Comments */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Comentarios (opcional)
                      </label>
                      <textarea
                        value={comments[option.option] || ''}
                        onChange={(e) => handleCommentChange(option.option, e.target.value)}
                        placeholder="Ej: Buena profundidad pero colores algo planos"
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        rows={2}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={submitting || !experiment.options.every(opt => ratings[opt.option])}
                className="mt-6 w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {submitting ? 'Guardando...' : 'Enviar Calificaciones'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
