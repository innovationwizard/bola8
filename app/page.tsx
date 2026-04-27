import Link from "next/link";
import Image from "next/image";
import UserMenu from "./components/UserMenu";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F8F6F2] text-[#171717] flex flex-col">
      <header className="border-b border-neutral-200/70 sticky top-0 z-10 bg-[#F8F6F2]/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-8 py-5 flex items-center justify-between">
          <span className="tracking-[0.35em] text-xs uppercase text-neutral-400">
            BOLA8 PLAYGROUND
          </span>
          <UserMenu />
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-8 py-20 text-center">

        <Image src="/logo.png" alt="BOLA8" width={108} height={108} className="object-contain mb-10" />

        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400 mb-6">
          Imagenes, Imaginación, Creatividad, Inspiración
        </p>

        <h1 className="text-4xl md:text-5xl font-light text-neutral-900 leading-tight max-w-2xl mb-20">
          Generación de imágenes profesionales de manera natural asistida por Inteligencia Artificial
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          <Link
            href="/projects"
            className="group border border-neutral-200 rounded-2xl p-10 hover:border-neutral-900 transition-all duration-200 space-y-4 text-left"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-400 group-hover:text-neutral-600">
              Campaigns
            </p>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Manage projects and image batches.
            </p>
          </Link>

          <Link
            href="/tools/enhancer"
            className="group border border-neutral-200 rounded-2xl p-10 hover:border-neutral-900 transition-all duration-200 space-y-4 text-left"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-400 group-hover:text-neutral-600">
              Studio
            </p>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Enhance, compose, and generate assets.
            </p>
          </Link>
        </div>

      </div>

      <Footer />
    </main>
  );
}
