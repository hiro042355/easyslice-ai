import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-cyan-950 text-white">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
        <Link href="/" className="text-sm font-bold text-cyan-300 hover:text-cyan-200">NEXCUT AI</Link>
        <header className="mt-8 border-b border-white/10 pb-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-4 text-sm text-gray-400">Last updated: October 7, 2026</p>
        </header>
        <article className="space-y-8 py-8 text-base leading-8 text-gray-200 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_p+p]:mt-3 [&_a]:break-words [&_a]:text-cyan-300 [&_a]:underline [&_a]:underline-offset-4">{children}</article>
        <footer className="flex flex-wrap gap-x-6 gap-y-3 border-t border-white/10 pt-6 text-sm text-cyan-300">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <a href="mailto:nexcut.ai@gmail.com">Contact</a>
        </footer>
      </div>
    </main>
  );
}
