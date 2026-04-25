'use client';

import { useState, useEffect, useCallback } from 'react';
import { Material, MaterialCategory } from '@/lib/material-library';
import { Plus, Edit, Trash2, Search, X, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const CATEGORIES: MaterialCategory[] = [
  'flooring', 'furniture', 'wall', 'fabric', 'metal', 'wood',
  'stone', 'glass', 'ceramic', 'paint'
];

const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  flooring: 'Pisos',
  furniture: 'Muebles',
  wall: 'Paredes',
  fabric: 'Telas',
  metal: 'Metal',
  wood: 'Madera',
  stone: 'Piedra',
  glass: 'Vidrio',
  ceramic: 'Cerámica',
  paint: 'Pintura',
};

export default function MaterialsAdminPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MaterialCategory | 'all'>('all');
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchMaterials = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetch(`/api/materials?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch materials');
      
      const data = await response.json();
      setMaterials(data);
    } catch (error) {
      console.error('Error fetching materials:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este material?')) {
      return;
    }

    try {
      const response = await fetch(`/api/materials/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete material');
      
      fetchMaterials();
    } catch (error) {
      console.error('Error deleting material:', error);
      alert('Error al eliminar el material');
    }
  };

  const handleSave = async (materialData: Partial<Material>) => {
    setSaving(true);
    try {
      const url = editingMaterial
        ? `/api/materials/${editingMaterial.id}`
        : '/api/materials';
      
      const method = editingMaterial ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: materialData.name,
          name_es: materialData.nameEs,
          category: materialData.category,
          color: materialData.color,
          texture: materialData.texture,
          leonardo_prompt: materialData.leonardoPrompt,
          negative_prompt: materialData.negativePrompt,
          common_uses: materialData.commonUses,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save material');
      }

      setShowForm(false);
      setEditingMaterial(null);
      fetchMaterials();
    } catch (error: unknown) {
      console.error('Error saving material:', error);
      const message = error instanceof Error ? error.message : 'Error al guardar el material';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const filteredMaterials = materials.filter(m => {
    if (selectedCategory !== 'all' && m.category !== selectedCategory) {
      return false;
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        m.name.toLowerCase().includes(query) ||
        m.nameEs.toLowerCase().includes(query) ||
        (m.texture && m.texture.toLowerCase().includes(query))
      );
    }
    return true;
  });

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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-light text-gray-900 mb-2">
                Biblioteca de Materiales
              </h1>
              <p className="text-sm text-gray-500">
                Gestiona los materiales disponibles para reemplazo en imágenes
              </p>
            </div>
            <button
              onClick={() => {
                setEditingMaterial(null);
                setShowForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuevo Material
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar materiales..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-2 text-sm rounded-md ${
                  selectedCategory === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todos
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-2 text-sm rounded-md ${
                    selectedCategory === cat
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Materials List */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Color
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Categoría
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Textura
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredMaterials.map((material) => (
                    <tr key={material.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {material.color && (
                          <div
                            className="w-8 h-8 rounded border border-gray-300"
                            style={{ backgroundColor: material.color }}
                          />
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {material.nameEs}
                        </div>
                        <div className="text-xs text-gray-500">{material.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs text-gray-600 capitalize">
                          {CATEGORY_LABELS[material.category]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-600">
                          {material.texture || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingMaterial(material);
                              setShowForm(true);
                            }}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(material.id)}
                            className="text-red-600 hover:text-red-900"
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
            {filteredMaterials.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No se encontraron materiales
              </div>
            )}
          </div>
        )}

        {/* Material Form Modal */}
        {showForm && (
          <MaterialForm
            material={editingMaterial}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false);
              setEditingMaterial(null);
            }}
            saving={saving}
          />
        )}
      </div>
    </div>
  );
}

function MaterialForm({
  material,
  onSave,
  onCancel,
  saving,
}: {
  material: Material | null;
  onSave: (data: Partial<Material>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [formData, setFormData] = useState({
    name: material?.name || '',
    nameEs: material?.nameEs || '',
    category: (material?.category || 'flooring') as MaterialCategory,
    color: material?.color || '',
    texture: material?.texture || '',
    leonardoPrompt: material?.leonardoPrompt || '',
    negativePrompt: material?.negativePrompt || '',
    commonUses: material?.commonUses?.join(', ') || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      commonUses: formData.commonUses
        ? formData.commonUses.split(',').map(s => s.trim()).filter(Boolean)
        : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium text-gray-900">
              {material ? 'Editar Material' : 'Nuevo Material'}
            </h2>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre (Inglés) *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre (Español) *
              </label>
              <input
                type="text"
                required
                value={formData.nameEs}
                onChange={(e) => setFormData({ ...formData, nameEs: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoría *
            </label>
            <select
              required
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as MaterialCategory })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color (Hex)
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={formData.color || '#FFFFFF'}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-16 h-10 border border-gray-300 rounded"
                />
                <input
                  type="text"
                  placeholder="#FFFFFF"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Textura
              </label>
              <input
                type="text"
                value={formData.texture}
                onChange={(e) => setFormData({ ...formData, texture: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prompt de Leonardo *
            </label>
            <textarea
              required
              rows={3}
              value={formData.leonardoPrompt}
              onChange={(e) => setFormData({ ...formData, leonardoPrompt: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              placeholder="Prompt optimizado para Leonardo AI..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Negative Prompt
            </label>
            <textarea
              rows={2}
              value={formData.negativePrompt}
              onChange={(e) => setFormData({ ...formData, negativePrompt: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              placeholder="Qué evitar..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Usos Comunes (separados por comas)
            </label>
            <input
              type="text"
              value={formData.commonUses}
              onChange={(e) => setFormData({ ...formData, commonUses: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
              placeholder="living room, bedroom, office"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Guardar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

