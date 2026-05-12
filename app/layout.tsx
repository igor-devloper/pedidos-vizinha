import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vizinha Salgateria",
  description: "Cardapio e informacoes da Vizinha Salgateria.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body
        className="
          min-h-screen
          bg-gradient-to-b from-pink-50 via-white to-pink-100
          text-slate-900
          antialiased
        "
      >
        <div
          className="pointer-events-none fixed inset-0 -z-10 opacity-50"
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,#f9a8d4_0,transparent_45%),radial-gradient(circle_at_100%_0%,#f472b6_0,transparent_45%),radial-gradient(circle_at_50%_100%,#fce7f3_0,transparent_55%)]" />
        </div>

        <main className="mt-10 flex-1">{children}</main>

        <footer className="mt-8 border-t border-pink-100 pt-4 text-center text-xs text-pink-500">
          (c) {new Date().getFullYear()} Vizinha Salgateria - Cardapio online -
          WhatsApp (83) 98713-7721
        </footer>

        <Toaster richColors position="top-center" />
        <Analytics />
      </body>
    </html>
  );
}
