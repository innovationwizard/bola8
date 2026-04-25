'use client';

import { useState, useEffect, useCallback } from 'react';
import { Material, MaterialCategory } from '@/lib/material-library';
import { Search, X, Loader2 } from 'lucide-react';

interface MaterialDB {
  id: string;
  name: string;
  name_es: string;
  category: MaterialCategory;
  color?: string;
  texture?: string;
  leonardo_prompt: string;
  negative_prompt?: string;
  common_uses?: string[];
}

interface MaterialPickerProps {
  selectedMaterial: Material | null;
  onSelect: (material: Material | null) => void;
  category?: MaterialCategory;
  label?: string;
}

const CATEGORY_LABELS: Record<MaterialCategory | 'all', string> = {
  all: 'Todos',
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

export default function MaterialPicker({
  selectedMaterial,
  onSelect,
  category,
  label = 'Seleccionar Material',
}: MaterialPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MaterialCategory | 'all'>(category || 'all');
  const [materials, setMaterials] = useState<MaterialDB[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      params.append('active', 'true');

      const response = await fetch(`/api/materials?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Error al cargar materiales');
      }
      
      const data = await response.json();
      setMaterials(data);
    } catch (err: unknown) {
      console.error('Error fetching materials:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Fallback to empty array on error
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  // Fetch materials from database with debounce for search
  useEffect(() => {
    if (!isOpen) return;

    const timeoutId = setTimeout(() => {
      fetchMaterials();
    }, searchQuery ? 300 : 0); // Debounce search queries

    return () => clearTimeout(timeoutId);
  }, [isOpen, selectedCategory, searchQuery, fetchMaterials]);

  // Convert DB material to Material interface
  const dbToMaterial = (db: MaterialDB): Material => ({
    id: db.id,
    name: db.name,
    nameEs: db.name_es,
    category: db.category,
    color: db.color || undefined,
    texture: db.texture || undefined,
    leonardoPrompt: db.leonardo_prompt,
    negativePrompt: db.negative_prompt || undefined,
    commonUses: db.common_uses || undefined,
  });

  // Get unique categories from fetched materials
  const availableCategories = Array.from(
    new Set(materials.map(m => m.category))
  ) as MaterialCategory[];

  const handleSelect = (material: MaterialDB) => {
    onSelect(dbToMaterial(material));
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      
      {/* Selected Material Display */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 text-left bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
      >
        {selectedMaterial ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedMaterial.color && (
                <div
                  className="w-8 h-8 rounded border border-gray-300"
                  style={{ backgroundColor: selectedMaterial.color }}
                />
              )}
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {selectedMaterial.nameEs || selectedMaterial.name}
                </div>
                <div className="text-xs text-gray-500 capitalize">
                  {selectedMaterial.category}
                </div>
              </div>
            </div>
            <X 
              className="w-4 h-4 text-gray-400 hover:text-gray-600"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(null);
              }}
            />
          </div>
        ) : (
          <span className="text-gray-500">Click para seleccionar...</span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
            {/* Search */}
            <div className="p-3 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar material..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="p-3 border-b border-gray-200">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Todos
                </button>
                {availableCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      selectedCategory === cat
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>

            {/* Materials List */}
            <div className="max-h-64 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500">Cargando materiales...</p>
                </div>
              ) : error ? (
                <div className="p-4 text-center">
                  <p className="text-sm text-red-600 mb-2">{error}</p>
                  <button
                    onClick={fetchMaterials}
                    className="text-xs text-gray-600 hover:text-gray-900 underline"
                  >
                    Reintentar
                  </button>
                </div>
              ) : materials.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  {searchQuery 
                    ? 'No se encontraron materiales con esa búsqueda'
                    : 'No hay materiales disponibles'}
                </div>
              ) : (
                materials.map((material) => (
                  <button
                    key={material.id}
                    onClick={() => handleSelect(material)}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 transition-colors ${
                      selectedMaterial?.id === material.id ? 'bg-gray-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {material.color ? (
                        <div
                          className="w-10 h-10 rounded border border-gray-300 flex-shrink-0 shadow-sm"
                          style={{ backgroundColor: material.color }}
                          title={material.color}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded border border-gray-300 flex-shrink-0 bg-gray-100" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {material.name_es || material.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {CATEGORY_LABELS[material.category]}
                        </div>
                        {material.texture && (
                          <div className="text-xs text-gray-400 mt-1 truncate">
                            {material.texture}
                          </div>
                        )}
                      </div>
                      {selectedMaterial?.id === material.id && (
                        <div className="flex-shrink-0">
                          <div className="w-2 h-2 rounded-full bg-gray-900" />
                        </div>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

