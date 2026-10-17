import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { HideOnAdmin } from "@/components/vizinha/site-chrome";
import { BUSINESS_INFO } from "@/lib/site-config";
import { getWhatsAppOrderUrl, SHOW_WHATSAPP_ORDER } from "@/lib/site-features";
import { groupOpeningHours } from "@/lib/store-notice";

export function SiteFooter({ operationSchedule }: { operationSchedule: unknown }) {
  const hours = groupOpeningHours(operationSchedule);

  return (
    <HideOnAdmin>
      <footer className="mt-16 vz-section-soft border-t border-brand-soft px-4 py-12 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-3">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-brand-soft bg-white">
                <Image src="/vizinha-logo.png" alt="" fill sizes="56px" className="object-cover" />
              </span>
              <p className="text-xl font-extrabold text-brand">Vizinha Salgateria</p>
            </div>
            <p className="text-lg text-ink-muted">O sabor que mora ao lado.</p>
          </div>

          <div>
            <h2 className="text-lg font-extrabold">Horário de funcionamento</h2>
            <ul className="mt-3 space-y-1 text-base">
              {hours.map((row) => (
                <li key={row.label}>
                  <strong>{row.label}:</strong> {row.hours}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-extrabold">Fale com a gente</h2>
            <ul className="mt-3 space-y-2 text-base">
              <li>
                <Link href="/cardapio" className="inline-flex min-h-12 items-center font-bold text-brand underline underline-offset-4">
                  Ver o cardápio
                </Link>
              </li>
              {SHOW_WHATSAPP_ORDER ? (
                <li>
                  <a
                    href={getWhatsAppOrderUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-12 items-center gap-2 font-bold text-brand underline underline-offset-4"
                  >
                    <MessageCircle className="h-5 w-5" aria-hidden="true" />
                    WhatsApp {BUSINESS_INFO.supportPhone}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <p className="mx-auto mt-10 max-w-6xl border-t border-brand-soft pt-6 text-base text-ink-muted">
          © {new Date().getFullYear()} Vizinha Salgateria. Todos os direitos reservados.
        </p>
      </footer>
    </HideOnAdmin>
  );
}
