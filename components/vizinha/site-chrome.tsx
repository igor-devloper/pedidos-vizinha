"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { CartHeaderButton } from "@/components/cart-ui";

/** O painel da Vizinha (/manhia) tem a própria navegação: cabeçalho e rodapé do site ficam de fora. */
export function HideOnAdmin({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return pathname?.startsWith("/manhia") ? null : <>{children}</>;
}

export function SiteHeader() {
  return (
    <HideOnAdmin>
      <header className="sticky top-0 z-30 border-b border-brand-soft bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-h-12 items-center gap-3" aria-label="Vizinha Salgateria, página inicial">
            <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-brand-soft bg-white">
              <Image src="/vizinha-logo.png" alt="" fill sizes="48px" className="object-cover" />
            </span>
            <span className="hidden text-xl font-extrabold text-brand sm:inline">Vizinha Salgateria</span>
          </Link>

          <nav aria-label="Principal" className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/cardapio"
              className="hidden min-h-12 items-center rounded-full px-4 text-lg font-bold text-ink hover:bg-brand-soft sm:inline-flex"
            >
              Cardápio
            </Link>
            <CartHeaderButton />
          </nav>
        </div>
      </header>
    </HideOnAdmin>
  );
}
