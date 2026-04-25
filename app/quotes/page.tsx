'use client';

import Link from 'next/link';
import { Calculator, ArrowLeft } from 'lucide-react';

export default function QuotesPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Panel
          </Link>
          <h1 className="text-3xl font-light text-gray-900 mb-2">Cotizaciones</h1>
          <p className="text-sm text-gray-500">Calcula precios para diseño de espacios y piezas de mobiliario</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Space Design Quote */}
          <Link
            href="/quotes/space"
            className="group bg-white rounded-lg border border-gray-200 p-8 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-light text-gray-900 mb-2">Diseño de Espacios</h2>
                <p className="text-sm text-gray-500">
                  Calcula precios para proyectos de diseño de espacios interiores
                </p>
              </div>
              <Calculator className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
            </div>
            <div className="mt-6 text-xs text-gray-400">
              Tipo de espacio, área, alcance, materiales y revisiones
            </div>
          </Link>

          {/* Furniture Quote */}
          <Link
            href="/quotes/furniture"
            className="group bg-white rounded-lg border border-gray-200 p-8 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-light text-gray-900 mb-2">Pieza de Mobiliario</h2>
                <p className="text-sm text-gray-500">
                  Calcula precios para piezas de mobiliario personalizadas
                </p>
              </div>
              <Calculator className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
            </div>
            <div className="mt-6 text-xs text-gray-400">
              Dimensiones, nivel de material, complejidad y complementos
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
