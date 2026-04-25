"use client";

import EnhancedEnhancer from "../../components/EnhancedEnhancer";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function EnhancerToolPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Panel
          </Link>
          <h1 className="text-3xl font-light text-gray-900 mb-2">Asistente de Render</h1>
          <p className="text-sm text-gray-500">
            Mejora imágenes de propuesta con IA. Cambia materiales y colores con precisión.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <EnhancedEnhancer />
        </div>
      </div>
    </div>
  );
}


