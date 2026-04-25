import Link from "next/link";
import UserMenu from "./components/UserMenu";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F8F6F2] text-[#171717] flex flex-col">
      <header className="border-b border-neutral-200/70 sticky top-0 z-10 bg-[#F8F6F2]/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <span className="tracking-[0.35em] text-xs uppercase text-neutral-400">
            BOLA8
          </span>
          <UserMenu />
        </div>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-16 space-y-16">

        <section className="space-y-3">
          <p className="text-xs uppercase tracking-[0.25em] text-neutral-400">
            Marketing Images
          </p>
          <h1 className="text-3xl font-light text-neutral-900">
            Automated image production.
          </h1>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/projects"
            className="group border border-neutral-200 rounded-2xl p-8 hover:border-neutral-900 transition-all duration-200 space-y-3"
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
            className="group border border-neutral-200 rounded-2xl p-8 hover:border-neutral-900 transition-all duration-200 space-y-3"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-400 group-hover:text-neutral-600">
              Studio
            </p>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Enhance, compose, and generate assets.
            </p>
          </Link>
        </section>

      </div>

      <footer className="border-t border-neutral-200/70 py-6">
        <p className="text-center text-xs text-neutral-400 tracking-[0.2em] uppercase">
          Powered by Artificial Intelligence Developments © 2026
        </p>
      </footer>
    </main>
  );
}
