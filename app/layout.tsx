import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Montserrat } from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Vizinha Salgateria",
  description: "Cardápio e informações da Vizinha Salgateria.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body
        className={`${montserrat.variable} min-h-screen bg-[linear-gradient(180deg,#fff7fd,#f4fffd_48%,#fff0fc)] font-sans text-slate-900 antialiased`}
      >
        <div className="pointer-events-none fixed inset-0 -z-10 opacity-50" aria-hidden="true">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,#4caf5040_0,transparent_38%),radial-gradient(circle_at_100%_0%,#fdd83535_0,transparent_34%),radial-gradient(circle_at_50%_100%,#c8e6c940_0,transparent_48%)]" />
        </div>

        <main className="mt-10 flex-1">{children}</main>

        <footer className="mt-8 border-t border-[#f4a8eb] pt-4 text-center text-xs text-[#8f147b]">
          © {new Date().getFullYear()} Vizinha Salgateria · Cardápio online · WhatsApp (83)
          99376-0485
        </footer>

        <Toaster richColors position="top-center" />
        <Analytics />
      </body>
    </html>
  );
}
