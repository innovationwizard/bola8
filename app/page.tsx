'use client';

import { PowerOff } from "lucide-react";
import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F8F6F2] px-6 text-[#171717]">
      <div className="w-full max-w-2xl text-center space-y-8">
        <div className="flex flex-col items-center gap-4 mb-8">
          <Image
            src="/BOLA8BLUE.png"
            alt="BOLA8 Logo"
            width={120}
            height={120}
            className="w-24 h-24 opacity-90"
            priority
          />
          <p className="tracking-[0.35em] text-xs uppercase text-neutral-500">
            BOLA8
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-neutral-900/10 blur-2xl" />
            <div className="relative rounded-full border-2 border-neutral-900/20 bg-white/70 p-8">
              <PowerOff className="h-24 w-24 text-neutral-600" strokeWidth={1.5} />
            </div>
          </div>
        </div>

        <h1 className="text-3xl md:text-4xl font-light text-neutral-900 leading-tight">
          Los motores de Inteligencia Artificial están apagados temporalmente.
        </h1>

        <p className="text-base md:text-lg text-neutral-500 max-w-xl mx-auto leading-relaxed">
          Por favor contacte a la administración para volver a encenderlos.
        </p>

        <div className="mt-16 pt-8 border-t border-neutral-200/70">
          <div className="text-xs text-neutral-400 tracking-[0.2em] uppercase">
            Powered by Artificial Intelligence Developments © 2026
          </div>
        </div>
      </div>
    </main>
  );
}
