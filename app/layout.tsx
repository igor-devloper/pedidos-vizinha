import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

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
        className={`${inter.variable} min-h-screen bg-[linear-gradient(180deg,#f7ffe7,#fffde7_48%,#eef8d1)] text-slate-900 antialiased`}
      >
        <div className="pointer-events-none fixed inset-0 -z-10 opacity-50" aria-hidden="true">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,#4caf5040_0,transparent_38%),radial-gradient(circle_at_100%_0%,#fdd83535_0,transparent_34%),radial-gradient(circle_at_50%_100%,#c8e6c940_0,transparent_48%)]" />
        </div>

        <main className="mt-10 flex-1">{children}</main>

        <footer className="mt-8 border-t border-[#dbe7b6] pt-4 text-center text-xs text-[#4c7a38]">
          (c) {new Date().getFullYear()} Vizinha Salgateria - Cardapio online - WhatsApp (83)
          99376-0485
        </footer>

        <Toaster richColors position="top-center" />
        <Analytics />
      </body>
    </html>
  );
}
