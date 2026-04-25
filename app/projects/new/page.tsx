'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    project_name: '',
    project_type: 'space_design' as 'space_design' | 'furniture_design',
    budget_range: '',
    room_type: '',
    notes: '',
  });
  const [numSpaces, setNumSpaces] = useState<number>(0);
  const [spaces, setSpaces] = useState<Array<{ name: string; description: string }>>([]);

  const handleNumSpacesChange = (value: number) => {
    const num = Math.max(0, Math.min(20, value)); // Limit to 0-20 spaces
    setNumSpaces(num);
    // Initialize spaces array
    const newSpaces = Array(num).fill(null).map((_, i) => 
      spaces[i] || { name: '', description: '' }
    );
    setSpaces(newSpaces.slice(0, num));
  };

  const handleSpaceChange = (index: number, field: 'name' | 'description', value: string) => {
    const newSpaces = [...spaces];
    newSpaces[index] = { ...newSpaces[index], [field]: value };
    setSpaces(newSpaces);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate spaces if project type is space_design
    if (formData.project_type === 'space_design' && numSpaces > 0) {
      const invalidSpaces = spaces.filter((s, i) => i < numSpaces && !s.name.trim());
      if (invalidSpaces.length > 0) {
        setError('Por favor, proporciona un nombre para todos los espacios');
        setLoading(false);
        return;
      }
    }

    try {
      // Create project
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create project');
      }

      const projectId = data.project.id;

      // Create spaces if specified
      if (formData.project_type === 'space_design' && numSpaces > 0) {
        for (let i = 0; i < numSpaces; i++) {
          const space = spaces[i];
          if (space && space.name.trim()) {
            await fetch('/api/spaces', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                project_id: projectId,
                name: space.name.trim(),
                description: space.description || null,
                display_order: i,
              }),
            });
          }
        }
      }

      router.push(`/projects/${projectId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Inicio
            </Link>
            <span className="text-gray-300">|</span>
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Proyectos
            </Link>
          </div>
          <h1 className="text-3xl font-light text-gray-900 mb-2">Nuevo Proyecto</h1>
          <p className="text-sm text-gray-500">Crea un nuevo proyecto de diseño</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-8 space-y-6">
          {/* Client Information */}
          <div>
            <h2 className="text-lg font-light text-gray-900 mb-4">Información del Cliente</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Cliente *
                </label>
                <input
                  type="text"
                  required
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    value={formData.client_email}
                    onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={formData.client_phone}
                    onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Project Information */}
          <div>
            <h2 className="text-lg font-light text-gray-900 mb-4">Información del Proyecto</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Proyecto *
                </label>
                <input
                  type="text"
                  required
                  value={formData.project_name}
                  onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Proyecto *
                </label>
                <select
                  required
                  value={formData.project_type}
                  onChange={(e) => setFormData({ ...formData, project_type: e.target.value as 'space_design' | 'furniture_design' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                >
                  <option value="space_design">Diseño de Espacios</option>
                  <option value="furniture_design">Diseño de Mobiliario</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rango de Presupuesto
                  </label>
                  <input
                    type="text"
                    value={formData.budget_range}
                    onChange={(e) => setFormData({ ...formData, budget_range: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                    placeholder="ej., $50,000 - $75,000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Espacio
                  </label>
                  <input
                    type="text"
                    value={formData.room_type}
                    onChange={(e) => setFormData({ ...formData, room_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                    placeholder="ej., Sala de Estar"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notas
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Spaces Configuration (only for space_design) */}
          {formData.project_type === 'space_design' && (
            <div>
              <h2 className="text-lg font-light text-gray-900 mb-4">Espacios del Proyecto</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Número de Espacios
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={numSpaces}
                    onChange={(e) => handleNumSpacesChange(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Especifica cuántos espacios (habitaciones/áreas) tiene este proyecto
                  </p>
                </div>

                {numSpaces > 0 && (
                  <div className="space-y-3">
                    {Array.from({ length: numSpaces }).map((_, index) => (
                      <div key={index} className="p-4 border border-gray-200 rounded-md space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Espacio {index + 1} - Nombre *
                          </label>
                          <input
                            type="text"
                            required
                            value={spaces[index]?.name || ''}
                            onChange={(e) => handleSpaceChange(index, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                            placeholder="ej., Sala Principal, Comedor, Dormitorio"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Descripción (Opcional)
                          </label>
                          <textarea
                            value={spaces[index]?.description || ''}
                            onChange={(e) => handleSpaceChange(index, 'description', e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                            placeholder="Descripción del espacio..."
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <Link
              href="/projects"
              className="px-6 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors text-sm font-light disabled:opacity-50"
            >
              {loading ? 'Creando...' : 'Crear Proyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

