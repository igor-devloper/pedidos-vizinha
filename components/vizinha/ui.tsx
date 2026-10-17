import Link from "next/link";
import type { ReactNode } from "react";
import { CircleCheck, CircleX } from "lucide-react";

import type { StoreStatusView } from "@/lib/store-notice";
import { cn } from "@/lib/utils";

// Peças visuais da Vizinha. Cores vêm dos tokens do globals.css (bg-brand, text-ink, bg-mint...),
// todas com contraste de pelo menos 7:1 nos pares usados aqui.

/** Etiqueta pequena colorida acima do título de cada seção. */
export function Eyebrow({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "light" }) {
  return (
    <p className={cn("text-base font-extrabold uppercase tracking-wider", tone === "light" ? "text-white" : "text-brand")}>
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  children,
  tone = "dark",
  id,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  tone?: "dark" | "light";
  id?: string;
}) {
  return (
    <div className="max-w-2xl space-y-3">
      <Eyebrow tone={tone === "light" ? "light" : "brand"}>{eyebrow}</Eyebrow>
      <h2 id={id} className={cn("text-3xl font-extrabold leading-tight sm:text-4xl", tone === "light" ? "text-white" : "text-ink")}>
        {title}
      </h2>
      {children ? (
        <p className={cn("text-lg leading-relaxed", tone === "light" ? "text-white" : "text-ink-muted")}>{children}</p>
      ) : null}
    </div>
  );
}

/** Selo de texto (promoção, novidade...). Sempre com palavras, nunca só cor. */
export function Selo({ children, tone = "soft", className }: { children: ReactNode; tone?: "brand" | "soft" | "mint" | "notice"; className?: string }) {
  const tones = {
    brand: "bg-brand text-white",
    soft: "bg-brand-soft text-brand",
    mint: "bg-mint text-mint-dark",
    notice: "bg-notice text-notice-ink",
  };
  return <span className={cn("inline-flex items-center rounded-full px-4 py-1.5 text-base font-bold", tones[tone], className)}>{children}</span>;
}

const BUTTON_BASE =
  "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-7 py-3 text-center text-lg font-extrabold transition sm:w-auto sm:whitespace-nowrap";

const BUTTON_VARIANTS = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "border-2 border-brand bg-white text-brand hover:bg-brand-soft",
  onDark: "bg-white text-brand hover:bg-brand-soft",
  outlineOnDark: "border-2 border-white bg-transparent text-white hover:bg-white/15",
  whatsapp: "bg-open text-white hover:bg-[#074a28]",
} as const;

export function ButtonLink({
  href,
  variant = "primary",
  external = false,
  icon,
  children,
  className,
}: {
  href: string;
  variant?: keyof typeof BUTTON_VARIANTS;
  external?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const classes = cn(BUTTON_BASE, BUTTON_VARIANTS[variant], className);
  const content = (
    <>
      {icon}
      {children}
    </>
  );

  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
      {content}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}

/** Faixa de largura total, em degradê da marca ou em menta. */
export function Faixa({ tone = "gradient", children, className }: { tone?: "gradient" | "mint"; children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "relative overflow-hidden px-4 py-12 sm:px-6 sm:py-16 lg:px-8",
        tone === "gradient" ? "vz-gradient text-white" : "vz-section-mint text-ink",
        className,
      )}
    >
      {/* Enfeites: círculos suaves, só decoração. */}
      <span aria-hidden="true" className="vz-dot -right-16 -top-20 hidden h-64 w-64 bg-white/10 md:block" />
      <span aria-hidden="true" className="vz-dot -bottom-24 right-40 hidden h-48 w-48 bg-white/10 md:block" />
      <div className="relative mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

/** Cartão do status da loja: ícone + texto, aberto ou fechado. */
export function StatusLoja({ view, className }: { view: StoreStatusView; className?: string }) {
  const Icon = view.open ? CircleCheck : CircleX;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-2xl border-2 bg-white p-4 shadow-lg",
        view.open ? "border-open" : "border-closed",
        className,
      )}
    >
      <Icon className={cn("mt-0.5 h-7 w-7 shrink-0", view.open ? "text-open" : "text-closed")} aria-hidden="true" />
      <div>
        <p className={cn("text-lg font-extrabold", view.open ? "text-open" : "text-closed")}>{view.title}</p>
        {view.detail ? <p className="text-base text-ink">{view.detail}</p> : null}
      </div>
    </div>
  );
}

/** Cartão branco arredondado, base de todos os blocos de conteúdo. */
export function Cartao({
  children,
  className,
  tone = "soft",
}: {
  children: ReactNode;
  className?: string;
  tone?: "soft" | "mint";
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-brand-soft shadow-md shadow-brand/10",
        tone === "mint" ? "vz-card-mint" : "vz-card",
        className,
      )}
    >
      {children}
    </div>
  );
}
