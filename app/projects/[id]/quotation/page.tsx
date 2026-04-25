'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileDown, Image as ImageIcon, Edit2, X, Save, Trash2 } from 'lucide-react';

interface QuotationItem {
  id: string;
  space_id: string | null;
  space_name: string | null;
  item_name: string;
  category: string | null;
  description: string | null;
  dimensions: Record<string, unknown> | null;
  materials: string[] | null;
  quantity: number;
  unit_symbol: string | null;
  unit_cost: number;
  labor_cost: number;
  subtotal: number;
  iva_rate: number;
  price_with_iva: number;
  margin_rate: number;
  profit: number;
  image_id: string | null;
  notes: string | null;
}

interface QuotationVersion {
  id: string;
  version_number: number;
  changes_description: string;
  is_final: boolean;
  items: QuotationItem[];
  totals: {
    total_cost: number;
    total_with_iva: number;
    total_profit: number;
  };
}

interface Quotation {
  id: string;
  project_id: string;
  iva_rate: number;
  margin_rate: number;
  status: string;
  current_version: QuotationVersion | null;
}

export default function QuotationPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<QuotationItem> | null>(null);
  const [units, setUnits] = useState<Record<string, unknown>[]>([]);

  const fetchUnits = useCallback(async () => {
    try {
      const response = await fetch('/api/cost-libraries/units');
      const data = await response.json();
      setUnits(data.units || []);
    } catch (error) {
      console.error('Error fetching units:', error);
    }
  }, []);

  const fetchQuotation = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get quotation for project
      const quotesResponse = await fetch(`/api/quotes?project_id=${projectId}`);
      const quotesData = await quotesResponse.json();
      
      if (quotesData.quotes && quotesData.quotes.length > 0) {
        const quoteId = quotesData.quotes[0].id;
        
        // Get full quotation with current version
        const quoteResponse = await fetch(`/api/quotes/${quoteId}`);
        const quoteData = await quoteResponse.json();
        setQuotation(quoteData.quotation);
        
      } else {
        // No quotation exists yet - will be created automatically on first image
        setQuotation(null);
      }
    } catch (error) {
      console.error('Error fetching quotation:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchQuotation();
    fetchUnits();
  }, [fetchQuotation, fetchUnits]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const handleExportPNG = async () => {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const quotationContent = document.getElementById('quotation-content');
      
      if (!quotationContent) {
        alert('No se pudo encontrar el contenido de la cotización');
        return;
      }

      // Capture the content
      const canvas = await html2canvas(quotationContent, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cotizacion-${projectId}-v${version.version_number}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });
    } catch (error) {
      console.error('Error exporting PNG:', error);
      alert('Error al exportar a PNG');
    }
  };

  const handleExportPDF = async () => {
    try {
      if (!quotation || !quotation.current_version) return;

      // Get PDF HTML from API
      const response = await fetch(`/api/quotes/${quotation.id}/export/pdf?version_id=${version.id}`);
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const { html } = await response.json();
      const pdfWindow = window.open('', '_blank');
      if (pdfWindow) {
        pdfWindow.document.write(html);
        pdfWindow.document.close();
        pdfWindow.print();
      } else {
        // Fallback: download HTML
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cotizacion-${projectId}-v${version.version_number}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Error al exportar a PDF. Se descargará como HTML.');
    }
  };

  const handleEditItem = (item: QuotationItem) => {
    setEditingItemId(item.id);
    setEditingItem({ ...item });
  };

  const handleSaveItem = async () => {
    if (!editingItemId || !editingItem || !quotation?.current_version) return;

    try {
      const response = await fetch(
        `/api/quotes/${quotation.id}/versions/${quotation.current_version.id}/items/${editingItemId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingItem),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error}`);
        return;
      }

      await fetchQuotation();
      setEditingItemId(null);
      setEditingItem(null);
    } catch (error) {
      console.error('Error saving item:', error);
      alert('Error al guardar el ítem');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este ítem?')) return;
    if (!quotation?.current_version) return;

    try {
      const response = await fetch(
        `/api/quotes/${quotation.id}/versions/${quotation.current_version.id}/items/${itemId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error}`);
        return;
      }

      await fetchQuotation();
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Error al eliminar el ítem');
    }
  };

  // Group items by space
  const groupItemsBySpace = (items: QuotationItem[]) => {
    const grouped: Record<string, QuotationItem[]> = {};
    const ungrouped: QuotationItem[] = [];

    items.forEach((item) => {
      if (item.space_id && item.space_name) {
        if (!grouped[item.space_id]) {
          grouped[item.space_id] = [];
        }
        grouped[item.space_id].push(item);
      } else {
        ungrouped.push(item);
      }
    });

    return { grouped, ungrouped };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <p className="text-gray-500">Cargando cotización...</p>
      </div>
    );
  }

  if (!quotation || !quotation.current_version) {
    return (
      <div className="min-h-screen bg-[#FAFAF8]">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="mb-8">
            <Link
              href={`/projects/${projectId}`}
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al Proyecto
            </Link>
            <h1 className="text-3xl font-light text-gray-900 mb-2">Cotización</h1>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-500 mb-4">
              La cotización se creará automáticamente cuando se agreguen imágenes mejoradas al proyecto.
            </p>
            <Link
              href={`/projects/${projectId}`}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              Ir al Proyecto
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const version = quotation.current_version;
  const { grouped, ungrouped } = groupItemsBySpace(version.items);

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Proyecto
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-light text-gray-900 mb-2">Cotización</h1>
              <p className="text-sm text-gray-500">
                Versión {version.version_number} • {version.is_final ? 'Final' : 'Borrador'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportPNG}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                <ImageIcon className="w-4 h-4" />
                Exportar PNG
              </button>
              <button
                onClick={handleExportPDF}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-white bg-gray-900 rounded hover:bg-gray-800 transition-colors"
              >
                <FileDown className="w-4 h-4" />
                Exportar PDF
              </button>
            </div>
          </div>
        </div>

        {/* Quotation Content */}
        <div className="bg-white rounded-lg border border-gray-200 p-8" id="quotation-content">
          {/* Items grouped by space */}
          {Object.entries(grouped).map(([spaceId, items]) => (
            <div key={spaceId} className="mb-8 last:mb-0">
              <h2 className="text-xl font-light text-gray-900 mb-4 pb-2 border-b border-gray-200">
                {items[0].space_name}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Cantidad</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Costo Unit.</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Mano de Obra</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Subtotal</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Precio con IVA</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Utilidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{item.item_name}</div>
                          {item.description && (
                            <div className="text-xs text-gray-500 mt-1">{item.description}</div>
                          )}
                          {item.materials && Array.isArray(item.materials) && item.materials.length > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              Materiales: {item.materials.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {item.quantity} {item.unit_symbol || 'u'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {formatCurrency(item.unit_cost)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {formatCurrency(item.labor_cost)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatCurrency(item.subtotal)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatCurrency(item.price_with_iva)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {formatCurrency(item.profit)}
                        </td>
                      </tr>
                    ))}
                    {/* Space subtotal */}
                    <tr className="bg-gray-50 font-medium">
                      <td colSpan={4} className="px-4 py-3 text-right text-gray-700">
                        Subtotal {items[0].space_name}:
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {formatCurrency(items.reduce((sum, item) => sum + item.subtotal, 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {formatCurrency(items.reduce((sum, item) => sum + item.price_with_iva, 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {formatCurrency(items.reduce((sum, item) => sum + item.profit, 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Ungrouped items */}
          {ungrouped.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-light text-gray-900 mb-4 pb-2 border-b border-gray-200">
                Otros Items
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Cantidad</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Costo Unit.</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Mano de Obra</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Subtotal</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Precio con IVA</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Utilidad</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {ungrouped.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          {editingItemId === item.id ? (
                            <input
                              type="text"
                              value={editingItem?.item_name || ''}
                              onChange={(e) => setEditingItem({ ...editingItem, item_name: e.target.value })}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            />
                          ) : (
                            <>
                              <div className="font-medium text-gray-900">{item.item_name}</div>
                              {item.description && (
                                <div className="text-xs text-gray-500 mt-1">{item.description}</div>
                              )}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {editingItemId === item.id ? (
                            <div className="flex gap-1">
                              <input
                                type="number"
                                step="0.01"
                                value={editingItem?.quantity || 0}
                                onChange={(e) => setEditingItem({ ...editingItem, quantity: parseFloat(e.target.value) || 0 })}
                                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                              <select
                                value={(editingItem as Record<string, unknown>)?.unit_id as string || ''}
                                onChange={(e) => setEditingItem({ ...editingItem, unit_id: e.target.value } as Partial<QuotationItem>)}
                                className="px-2 py-1 text-sm border border-gray-300 rounded"
                              >
                                {units.map((unit) => (
                                  <option key={unit.id as string} value={unit.id as string}>
                                    {unit.symbol as string}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            `${item.quantity} ${item.unit_symbol || 'u'}`
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {editingItemId === item.id ? (
                            <input
                              type="number"
                              step="0.01"
                              value={editingItem?.unit_cost || 0}
                              onChange={(e) => setEditingItem({ ...editingItem, unit_cost: parseFloat(e.target.value) || 0 })}
                              className="w-24 px-2 py-1 text-sm border border-gray-300 rounded text-right"
                            />
                          ) : (
                            formatCurrency(item.unit_cost)
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {editingItemId === item.id ? (
                            <input
                              type="number"
                              step="0.01"
                              value={editingItem?.labor_cost || 0}
                              onChange={(e) => setEditingItem({ ...editingItem, labor_cost: parseFloat(e.target.value) || 0 })}
                              className="w-24 px-2 py-1 text-sm border border-gray-300 rounded text-right"
                            />
                          ) : (
                            formatCurrency(item.labor_cost)
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatCurrency(item.subtotal)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatCurrency(item.price_with_iva)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {formatCurrency(item.profit)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editingItemId === item.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={handleSaveItem}
                                className="p-1.5 text-gray-600 hover:text-gray-900 transition-colors"
                                title="Guardar"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingItemId(null);
                                  setEditingItem(null);
                                }}
                                className="p-1.5 text-gray-600 hover:text-gray-900 transition-colors"
                                title="Cancelar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEditItem(item)}
                                className="p-1.5 text-gray-500 hover:text-gray-700 transition-colors"
                                title="Editar"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.id)}
                                className="p-1.5 text-gray-500 hover:text-red-600 transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Grand Totals */}
          <div className="mt-8 pt-6 border-t border-gray-300">
            <div className="flex justify-end">
              <div className="w-full max-w-md space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium text-gray-900">{formatCurrency(version.totals.total_cost)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">IVA ({(quotation.iva_rate * 100).toFixed(0)}%):</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(version.totals.total_with_iva - version.totals.total_cost)}
                  </span>
                </div>
                <div className="flex justify-between text-lg pt-2 border-t border-gray-300">
                  <span className="font-medium text-gray-900">Total:</span>
                  <span className="font-medium text-gray-900">{formatCurrency(version.totals.total_with_iva)}</span>
                </div>
                <div className="flex justify-between text-sm pt-2">
                  <span className="text-gray-600">Utilidad Estimada:</span>
                  <span className="font-medium text-gray-700">{formatCurrency(version.totals.total_profit)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

