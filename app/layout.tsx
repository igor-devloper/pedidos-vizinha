import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Montserrat } from "next/font/google";
import { Toaster } from "sonner";

import { SiteFooter } from "@/components/vizinha/site-footer";
import { SiteHeader } from "@/components/vizinha/site-chrome";
import { getStoreSettings } from "@/lib/business-hours";

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

export const viewport: Viewport = {
  themeColor: "#8a0f78",
};

async function getOperationSchedule() {
  try {
    return (await getStoreSettings()).operationSchedule;
  } catch {
    return {};
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const operationSchedule = await getOperationSchedule();

  return (
    <html lang="pt-BR">
      <body
        className={`${montserrat.variable} vz-page-bg min-h-screen font-sans text-ink antialiased`}
      >
        <a href="#conteudo" className="skip-link">
          Pular para o conteúdo
        </a>

        <SiteHeader />

        <main id="conteudo">{children}</main>

        <SiteFooter operationSchedule={operationSchedule} />

        <Toaster richColors position="top-center" duration={8000} closeButton />
        <Analytics />
      </body>
    </html>
  );
}
