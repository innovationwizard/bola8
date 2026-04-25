'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, X, Plus, Loader2 } from 'lucide-react';

interface Element {
  id: string;
  name: string;
  name_es: string | null;
  category: string;
  description: string | null;
  leonardo_prompt: string;
  placement_hints: string | null;
}

interface ElementAdditionToolProps {
  onElementsChange: (elementIds: string[]) => void;
  selectedElementIds: string[];
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

export default function ElementAdditionTool({ onElementsChange, selectedElementIds }: ElementAdditionToolProps) {
  const [elements, setElements] = useState<Element[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showPicker, setShowPicker] = useState(false);

  const fetchElements = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('active', 'true');
      if (selectedCategory) {
        params.append('category', selectedCategory);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetch(`/api/elements?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch elements');
      
      const data = await response.json();
      setElements(data.elements || []);
    } catch (error) {
      console.error('Error fetching elements:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    fetchElements();
  }, [fetchElements]);

  const selectedElements = elements.filter((el) => selectedElementIds.includes(el.id));
  const availableElements = elements.filter((el) => !selectedElementIds.includes(el.id));

  const categories = Array.from(new Set(elements.map((e) => e.category)));

  const handleAddElement = (elementId: string) => {
    if (!selectedElementIds.includes(elementId)) {
      onElementsChange([...selectedElementIds, elementId]);
    }
  };

  const handleRemoveElement = (elementId: string) => {
    onElementsChange(selectedElementIds.filter((id) => id !== elementId));
  };

  return (
    <div className="space-y-4">
      {/* Selected Elements */}
      {selectedElements.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Elementos seleccionados ({selectedElements.length})
          </label>
          <div className="flex flex-wrap gap-2">
            {selectedElements.map((element) => (
              <div
                key={element.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-sm"
              >
                <span className="text-gray-700">{element.name_es || element.name}</span>
                <button
                  onClick={() => handleRemoveElement(element.id)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Element Picker */}
      <div>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
        >
          <span>{showPicker ? 'Ocultar' : 'Agregar'} Elementos</span>
          <Plus className={`w-4 h-4 transition-transform ${showPicker ? 'rotate-45' : ''}`} />
        </button>

        {showPicker && (
          <div className="mt-3 bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            {/* Search and Filter */}
            <div className="space-y-2">
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
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
              >
                <option value="">Todas las categorías</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat] || cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Elements List */}
            {loading ? (
              <div className="text-center py-8">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400 mb-2" />
                <p className="text-xs text-gray-500">Cargando elementos...</p>
              </div>
            ) : availableElements.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">
                {searchQuery || selectedCategory
                  ? 'No se encontraron elementos'
                  : 'Todos los elementos ya están seleccionados'}
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {availableElements.map((element) => (
                  <button
                    key={element.id}
                    onClick={() => handleAddElement(element.id)}
                    className="w-full text-left px-3 py-2 text-sm border border-gray-200 rounded hover:bg-gray-50 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">
                          {element.name_es || element.name}
                        </div>
                        {element.description && (
                          <div className="text-xs text-gray-500 mt-0.5">{element.description}</div>
                        )}
                        <div className="text-xs text-gray-400 mt-1">
                          {CATEGORY_LABELS[element.category] || element.category}
                        </div>
                      </div>
                      <Plus className="w-4 h-4 text-gray-400" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedElements.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">
          Selecciona al menos un elemento para agregar a la imagen
        </p>
      )}
    </div>
  );
}

