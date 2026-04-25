'use client';

import { useState } from 'react';
import { ArrowLeft, Calculator } from 'lucide-react';
import Link from 'next/link';

export default function SpaceDesignQuotePage() {
  const [formData, setFormData] = useState({
    roomType: 'living' as const,
    area: '',
    scope: 'full' as const,
    materialTier: 'mid' as const,
    includesRenders: true,
    revisionRounds: 2,
  });

  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setResult(null);
    setError(null);
  };

  const handleCalculate = async () => {
    setIsCalculating(true);
    setError(null);

    try {
      const response = await fetch('/api/quotes/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'space',
          roomType: formData.roomType,
          area: parseFloat(formData.area),
          scope: formData.scope,
          materialTier: formData.materialTier,
          includesRenders: formData.includesRenders,
          revisionRounds: parseInt(formData.revisionRounds.toString()),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Calculation failed');
      }

      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <Link
            href="/quotes"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Cotizaciones
          </Link>
          <h1 className="text-3xl font-light text-gray-900 mb-2">Cotización Diseño de Espacios</h1>
          <p className="text-sm text-gray-500">Calcula precios para proyectos de diseño de espacios interiores</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-light text-gray-900 mb-6">Detalles del Proyecto</h2>

              <div className="space-y-5">
                {/* Room Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Espacio
                  </label>
                  <select
                    value={formData.roomType}
                    onChange={(e) => handleChange('roomType', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  >
                    <option value="living">Sala de Estar</option>
                    <option value="bedroom">Recámara</option>
                    <option value="kitchen">Cocina</option>
                    <option value="bathroom">Baño</option>
                    <option value="office">Oficina</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </div>

                {/* Area */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Área (m²)
                  </label>
                  <input
                    type="number"
                    value={formData.area}
                    onChange={(e) => handleChange('area', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                    placeholder="0"
                  />
                </div>

                {/* Scope */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Alcance del Proyecto
                  </label>
                  <select
                    value={formData.scope}
                    onChange={(e) => handleChange('scope', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  >
                    <option value="full">Diseño Completo</option>
                    <option value="partial">Diseño Parcial</option>
                    <option value="consultation">Solo Consultoría</option>
                  </select>
                </div>

                {/* Material Tier */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nivel de Material
                  </label>
                  <select
                    value={formData.materialTier}
                    onChange={(e) => handleChange('materialTier', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  >
                    <option value="basic">Básico</option>
                    <option value="mid">Intermedio</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>

                {/* Renders */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.includesRenders}
                      onChange={(e) => handleChange('includesRenders', e.target.checked)}
                      className="w-4 h-4 text-gray-600 border-gray-300 rounded focus:ring-gray-400"
                    />
                    <span className="text-sm text-gray-700">Incluir Renders</span>
                  </label>
                </div>

                {/* Revision Rounds */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rondas de Revisión (las primeras 2 incluidas)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.revisionRounds}
                    onChange={(e) => handleChange('revisionRounds', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
              </div>

              <button
                onClick={handleCalculate}
                disabled={isCalculating || !formData.area}
                className="w-full mt-6 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-light"
              >
                {isCalculating ? (
                  <>Calculando...</>
                ) : (
                  <>
                    <Calculator className="w-4 h-4" />
                    Calcular Cotización
                  </>
                )}
              </button>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Results */}
          <div>
            {result && (
              <div className="bg-white rounded-lg border border-gray-200 p-6 sticky top-6">
                <h2 className="text-lg font-light text-gray-900 mb-6">Resumen de Cotización</h2>

                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Base (×{((result.materialMultiplier as number) || 1).toFixed(1)} ×{((result.scopeMultiplier as number) || 1).toFixed(1)})</span>
                    <span className="text-gray-900">${((result.breakdown as Record<string, unknown>)?.base as number || 0).toLocaleString()} MXN</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Área ({((result.areaRate as number) || 0) / 2000} m²)</span>
                    <span className="text-gray-900">${((result.breakdown as Record<string, unknown>)?.area as number || 0).toLocaleString()} MXN</span>
                  </div>
                  {((result.breakdown as Record<string, unknown>)?.renders as number || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Renders</span>
                      <span className="text-gray-900">${((result.breakdown as Record<string, unknown>)?.renders as number || 0).toLocaleString()} MXN</span>
                    </div>
                  )}
                  {((result.breakdown as Record<string, unknown>)?.revisions as number || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Revisiones Adicionales</span>
                      <span className="text-gray-900">${((result.breakdown as Record<string, unknown>)?.revisions as number || 0).toLocaleString()} MXN</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Honorarios de Diseño</span>
                    <span className="text-gray-900">${((result.breakdown as Record<string, unknown>)?.designFee as number || 0).toLocaleString()} MXN</span>
                  </div>
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <div className="flex justify-between">
                      <span className="text-base font-medium text-gray-900">Total</span>
                      <span className="text-2xl font-light text-gray-900">
                        ${((result.total as number) || 0).toLocaleString()} MXN
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => window.print()}
                  className="w-full py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md transition-colors"
                >
                  Imprimir / Exportar
                </button>
              </div>
            )}

            {!result && (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <p className="text-sm text-gray-400">Completa el formulario y calcula para ver la cotización</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

