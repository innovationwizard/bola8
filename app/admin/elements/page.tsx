'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, X, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface Element {
  id: string;
  name: string;
  name_es: string | null;
  category: string;
  description: string | null;
  leonardo_prompt: string;
  negative_prompt: string | null;
  placement_hints: string | null;
  common_uses: string[] | null;
  dimensions: Record<string, unknown> | null;
  style: string | null;
  color: string | null;
  material: string | null;
  active: boolean;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  chair: 'Silla',
  table: 'Mesa',
  sofa: 'Sofá',
  coffee_table: 'Mesa de Centro',
  dining_table: 'Mesa de Comedor',
  desk: 'Escritorio',
  cabinet: 'Gabinete',
  shelf: 'Estante',
  bed: 'Cama',
  nightstand: 'Mesa de Noche',
  lamp: 'Lámpara',
  rug: 'Alfombra',
  curtain: 'Cortina',
  plant: 'Planta',
  artwork: 'Arte',
  accessory: 'Accesorio',
  other: 'Otro',
};

const STYLE_OPTIONS = [
  'modern',
  'classic',
  'scandinavian',
  'industrial',
  'minimalist',
  'traditional',
  'contemporary',
  'rustic',
];

export default function ElementsAdminPage() {
  const [elements, setElements] = useState<Element[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<Partial<Element>>({
    name: '',
    name_es: '',
    category: 'chair',
    description: '',
    leonardo_prompt: '',
    negative_prompt: '',
    placement_hints: '',
    common_uses: [],
    style: '',
    color: '',
    material: '',
    active: true,
  });

  const fetchElements = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (showActiveOnly) params.append('active', 'true');

      const response = await fetch(`/api/elements?${params.toString()}`);
      const data = await response.json();
      setElements(data.elements || []);
    } catch (error) {
      console.error('Error fetching elements:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, showActiveOnly]);

  useEffect(() => {
    fetchElements();
  }, [fetchElements]);

  const handleCreate = async () => {
    try {
      const response = await fetch('/api/elements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error}`);
        return;
      }

      await fetchElements();
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      console.error('Error creating element:', error);
      alert('Error al crear elemento');
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const element = elements.find((e) => e.id === id);
      if (!element) return;

      const response = await fetch(`/api/elements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error}`);
        return;
      }

      await fetchElements();
      setEditingId(null);
      resetForm();
    } catch (error) {
      console.error('Error updating element:', error);
      alert('Error al actualizar elemento');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este elemento?')) return;

    try {
      const response = await fetch(`/api/elements/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error}`);
        return;
      }

      await fetchElements();
    } catch (error) {
      console.error('Error deleting element:', error);
      alert('Error al eliminar elemento');
    }
  };

  const startEdit = (element: Element) => {
    setEditingId(element.id);
    setFormData({
      name: element.name,
      name_es: element.name_es || '',
      category: element.category,
      description: element.description || '',
      leonardo_prompt: element.leonardo_prompt,
      negative_prompt: element.negative_prompt || '',
      placement_hints: element.placement_hints || '',
      common_uses: element.common_uses || [],
      style: element.style || '',
      color: element.color || '',
      material: element.material || '',
      active: element.active,
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      name_es: '',
      category: 'chair',
      description: '',
      leonardo_prompt: '',
      negative_prompt: '',
      placement_hints: '',
      common_uses: [],
      style: '',
      color: '',
      material: '',
      active: true,
    });
  };

  const filteredElements = elements.filter((element) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        element.name.toLowerCase().includes(query) ||
        (element.name_es && element.name_es.toLowerCase().includes(query)) ||
        (element.description && element.description.toLowerCase().includes(query))
      );
    }
    return true;
  });

  const categories = Array.from(new Set(elements.map((e) => e.category)));

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Panel
          </Link>
          <h1 className="text-3xl font-light text-gray-900 mb-2">Biblioteca de Elementos</h1>
          <p className="text-sm text-gray-500">
            Gestiona los elementos de mobiliario que se pueden agregar a las imágenes
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar elementos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              <option value="">Todas las categorías</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat] || cat}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showActiveOnly}
                onChange={(e) => setShowActiveOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              Solo activos
            </label>
            <button
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuevo Elemento
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">Cargando elementos...</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Categoría
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Estilo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredElements.map((element) => (
                    <tr key={element.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {element.name_es || element.name}
                        </div>
                        {element.description && (
                          <div className="text-xs text-gray-500 mt-1">{element.description}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {CATEGORY_LABELS[element.category] || element.category}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {element.style || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                            element.active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {element.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startEdit(element)}
                            className="p-1.5 text-gray-500 hover:text-gray-700 transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(element.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredElements.length === 0 && (
              <div className="text-center py-12 text-sm text-gray-500">
                No se encontraron elementos
              </div>
            )}
          </div>
        )}

        {/* Create/Edit Modal */}
        {(showCreateModal || editingId) && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900">
                  {editingId ? 'Editar Elemento' : 'Nuevo Elemento'}
                </h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingId(null);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre (EN) *
                    </label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre (ES)
                    </label>
                    <input
                      type="text"
                      value={formData.name_es || ''}
                      onChange={(e) => setFormData({ ...formData, name_es: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Categoría *
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                      required
                    >
                      {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estilo
                    </label>
                    <select
                      value={formData.style || ''}
                      onChange={(e) => setFormData({ ...formData, style: e.target.value || null })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                    >
                      <option value="">Sin estilo</option>
                      {STYLE_OPTIONS.map((style) => (
                        <option key={style} value={style}>
                          {style.charAt(0).toUpperCase() + style.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prompt de Leonardo AI *
                  </label>
                  <textarea
                    value={formData.leonardo_prompt || ''}
                    onChange={(e) => setFormData({ ...formData, leonardo_prompt: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900 font-mono"
                    placeholder="Prompt optimizado para Leonardo AI..."
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Describe el elemento de manera que Leonardo AI pueda agregarlo a una imagen
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Negative Prompt
                  </label>
                  <textarea
                    value={formData.negative_prompt || ''}
                    onChange={(e) => setFormData({ ...formData, negative_prompt: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900 font-mono"
                    placeholder="Qué evitar al generar este elemento..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Instrucciones de Ubicación
                  </label>
                  <textarea
                    value={formData.placement_hints || ''}
                    onChange={(e) => setFormData({ ...formData, placement_hints: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                    placeholder="Pistas sobre dónde y cómo colocar este elemento..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Color (Hex)
                    </label>
                    <input
                      type="text"
                      value={formData.color || ''}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                      placeholder="#RRGGBB"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Material
                    </label>
                    <input
                      type="text"
                      value={formData.material || ''}
                      onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                      placeholder="madera, metal, tela..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estado
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.active !== false}
                      onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Activo</span>
                  </label>
                </div>
              </div>

              <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingId(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => (editingId ? handleUpdate(editingId) : handleCreate())}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded hover:bg-gray-800 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {editingId ? 'Guardar Cambios' : 'Crear Elemento'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

