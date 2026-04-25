'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, X, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface MaterialCost {
  id: string;
  material_id: string | null;
  name: string;
  unit_id: string;
  unit_name: string;
  unit_symbol: string;
  base_cost: number;
  labor_cost_per_unit: number;
  supplier: string | null;
  notes: string | null;
  active: boolean;
}

interface CostUnit {
  id: string;
  name: string;
  name_es: string;
  symbol: string;
}

export default function MaterialCostsAdminPage() {
  const [costs, setCosts] = useState<MaterialCost[]>([]);
  const [units, setUnits] = useState<CostUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<Partial<MaterialCost>>({
    name: '',
    unit_id: '',
    base_cost: 1.00,
    labor_cost_per_unit: 0,
    supplier: '',
    notes: '',
    active: true,
  });

  const fetchUnits = async () => {
    try {
      const response = await fetch('/api/cost-libraries/units');
      if (response.ok) {
        const data = await response.json();
        setUnits(data.units || []);
      }
    } catch (error) {
      console.error('Error fetching units:', error);
    }
  };

  const fetchCosts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (showActiveOnly) params.append('active', 'true');
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`/api/cost-libraries/material-costs?${params.toString()}`);
      const data = await response.json();
      setCosts(data.costs || []);
    } catch (error) {
      console.error('Error fetching material costs:', error);
    } finally {
      setLoading(false);
    }
  }, [showActiveOnly, searchQuery]);

  useEffect(() => {
    fetchUnits();
    fetchCosts();
  }, [fetchCosts]);

  useEffect(() => {
    if (searchQuery) {
      const debounce = setTimeout(() => fetchCosts(), 300);
      return () => clearTimeout(debounce);
    } else {
      fetchCosts();
    }
  }, [searchQuery, fetchCosts]);

  const handleCreate = async () => {
    try {
      const response = await fetch('/api/cost-libraries/material-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error}`);
        return;
      }

      await fetchCosts();
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      console.error('Error creating material cost:', error);
      alert('Error al crear costo de material');
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const response = await fetch(`/api/cost-libraries/material-costs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error}`);
        return;
      }

      await fetchCosts();
      setEditingId(null);
      resetForm();
    } catch (error) {
      console.error('Error updating material cost:', error);
      alert('Error al actualizar costo de material');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este costo?')) return;

    try {
      const response = await fetch(`/api/cost-libraries/material-costs/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error}`);
        return;
      }

      await fetchCosts();
    } catch (error) {
      console.error('Error deleting material cost:', error);
      alert('Error al eliminar costo');
    }
  };

  const startEdit = (cost: MaterialCost) => {
    setEditingId(cost.id);
    setFormData({
      name: cost.name,
      unit_id: cost.unit_id,
      base_cost: cost.base_cost,
      labor_cost_per_unit: cost.labor_cost_per_unit,
      supplier: cost.supplier || '',
      notes: cost.notes || '',
      active: cost.active,
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      unit_id: '',
      base_cost: 1.00,
      labor_cost_per_unit: 0,
      supplier: '',
      notes: '',
      active: true,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const filteredCosts = costs.filter((cost) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return cost.name.toLowerCase().includes(query);
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
          <h1 className="text-3xl font-light text-gray-900 mb-2">Costos de Materiales</h1>
          <p className="text-sm text-gray-500">
            Gestiona los costos base y de mano de obra para materiales
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
                  placeholder="Buscar costos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
            </div>
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
              Nuevo Costo
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">Cargando costos...</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Material</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Unidad</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">Costo Base</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">Mano de Obra</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Proveedor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Estado</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredCosts.map((cost) => (
                    <tr key={cost.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{cost.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{cost.unit_symbol || cost.unit_name}</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">{formatCurrency(cost.base_cost)}</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">{formatCurrency(cost.labor_cost_per_unit)}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{cost.supplier || '—'}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                            cost.active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {cost.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startEdit(cost)}
                            className="p-1.5 text-gray-500 hover:text-gray-700 transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cost.id)}
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
            {filteredCosts.length === 0 && (
              <div className="text-center py-12 text-sm text-gray-500">
                No se encontraron costos
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
                  {editingId ? 'Editar Costo' : 'Nuevo Costo de Material'}
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del Material *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unidad de Medida *
                  </label>
                  <select
                    value={formData.unit_id}
                    onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                    required
                  >
                    <option value="">Seleccionar unidad</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name_es || unit.name} ({unit.symbol})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Costo Base *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.base_cost}
                      onChange={(e) => setFormData({ ...formData, base_cost: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mano de Obra por Unidad
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.labor_cost_per_unit}
                      onChange={(e) => setFormData({ ...formData, labor_cost_per_unit: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Proveedor
                  </label>
                  <input
                    type="text"
                    value={formData.supplier || ''}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notas
                  </label>
                  <textarea
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                </div>

                <div>
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
                  {editingId ? 'Guardar Cambios' : 'Crear Costo'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

