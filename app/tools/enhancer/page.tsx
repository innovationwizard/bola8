"use client";

import EnhancedEnhancer from "../../components/EnhancedEnhancer";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function StudioPage() {
  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-4xl mx-auto px-8 py-16">

        <div className="mb-12">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
        </div>

        <div className="mb-10">
          <h1 className="text-2xl font-light text-neutral-900 mb-1">Studio</h1>
          <p className="text-sm text-neutral-400">
            Enhance, compose, and generate marketing assets.
          </p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-10">
          <EnhancedEnhancer />
        </div>

      </div>
    </div>
  );
}
