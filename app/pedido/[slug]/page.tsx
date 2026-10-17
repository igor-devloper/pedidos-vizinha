import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { AddToCartControls, FloatingCart } from "@/components/cart-ui";
import { getFullStoreStatus } from "@/lib/business-hours";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/pedidos";
import { cleanProductDescription, getProdutoComboItens } from "@/lib/produtos";
import { normalizeSaboresList } from "@/lib/sabores";
import { buildStoreNotice } from "@/lib/store-notice";
import { getWhatsAppOrderUrl } from "@/lib/whatsapp-link";

export const dynamic = "force-dynamic";

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const produto = await prisma.produto.findUnique({
    where: { slug },
    include: { productType: true },
  });

  if (!produto || !produto.ativo) {
    notFound();
  }

  const comboItens = getProdutoComboItens(produto as { comboItens?: unknown });
  const saboresSugeridos = normalizeSaboresList(produto.saboresSugeridos);
  const discountPercent = produto.emPromocao ? Number(produto.descontoPercentual || 0) : 0;
  const price = Number(produto.preco);
  const promotionalPrice = Number((price * (1 - discountPercent / 100)).toFixed(2));
  const displayPrice = discountPercent > 0 ? promotionalPrice : price;
  const businessStatus = await getFullStoreStatus();
  const isDefaultTheme = businessStatus.siteTheme === "PADRAO";
  const whatsappUrl = getWhatsAppOrderUrl(`Olá! Quero pedir: ${produto.nome}.`);
  const notice = buildStoreNotice({
    operationSchedule: businessStatus.operationSchedule,
    closedByOwner: businessStatus.closedByOwner,
  });
  const minimum = produto.productType?.allowsMultiple ? produto.productType.minQuantity : null;

  // Cores escuras o bastante para texto com contraste de pelo menos 7:1.
  const themeStyle = {
    "--theme-accent": isDefaultTheme ? "#6b0f5c" : "#0f5223",
    "--theme-surface": isDefaultTheme ? "#fdf1fb" : "#f3f9e4",
    "--theme-border": isDefaultTheme ? "#c25bb4" : "#8fb36a",
    "--theme-text": isDefaultTheme ? "#4a0a3f" : "#0b2d16",
    "--theme-muted": isDefaultTheme ? "#3d2a39" : "#27402c",
  } as CSSProperties;

  const rules = [
    minimum ? `Pedido mínimo: ${minimum} salgados.` : `Vem com ${produto.totalUnidades} salgados.`,
    ...(produto.precisaSelecaoDeTipos && comboItens.length === 0
      ? [
          minimum
            ? `A cada ${minimum} salgados você escolhe até ${produto.maxTiposSalgado} sabores.`
            : `Você escolhe até ${produto.maxTiposSalgado} sabores diferentes.`,
        ]
      : []),
    produto.permitePagamentoParcial
      ? "Você pode pagar metade agora (50%) ou o valor todo."
      : "O pagamento é do valor todo.",
  ];

  return (
    <div style={themeStyle} className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="min-w-0 overflow-hidden rounded-3xl border-2 border-[var(--theme-border)] bg-white shadow-lg">
          <div className="relative aspect-[4/3] bg-[var(--theme-surface)]">
            <Image src={produto.imagemBase64} alt={`Foto de ${produto.nome}`} fill unoptimized className="object-cover" />
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <Link
            href="/cardapio"
            className="inline-flex min-h-12 w-fit max-w-full items-center gap-2 rounded-full border-2 border-[var(--theme-accent)] px-4 py-2 text-lg font-bold text-[var(--theme-accent)] hover:bg-[var(--theme-surface)]"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            Voltar ao cardápio
          </Link>

          {notice ? (
            <div role="status" className="rounded-3xl border-2 border-[#a16207] bg-[#fff8db] p-4 text-[#3b2a00]">
              <p className="text-lg font-extrabold">{notice.title}</p>
              <p className="mt-1 text-base">{notice.text}</p>
            </div>
          ) : null}

          <div className="space-y-5 rounded-3xl border-2 border-[var(--theme-border)] bg-white p-4 shadow-lg sm:p-8">
            <div className="space-y-3">
              {discountPercent > 0 ? (
                <p className="inline-block rounded-full bg-[var(--theme-surface)] px-3 py-1 text-base font-bold text-[var(--theme-accent)]">
                  Promoção: você economiza {formatCurrency(price - promotionalPrice)}
                </p>
              ) : null}
              <h1 className="text-3xl font-extrabold leading-tight text-[var(--theme-text)] sm:text-4xl">{produto.nome}</h1>
              <p className="text-lg leading-relaxed text-[var(--theme-muted)]">{cleanProductDescription(produto.descricao, minimum)}</p>

              <p className="text-[var(--theme-accent)]">
                {discountPercent > 0 ? (
                  <span className="mr-2 text-lg font-medium text-slate-700 line-through">
                    <span className="sr-only">Preço antes: </span>
                    {formatCurrency(price)}
                  </span>
                ) : null}
                <span className="sr-only">Preço: </span>
                <span className="text-4xl font-extrabold">{formatCurrency(displayPrice)}</span>
                {minimum ? <span className="ml-1 text-lg font-semibold"> a cada {produto.totalUnidades} salgados</span> : null}
              </p>
            </div>

            <ul className="grid gap-3 rounded-2xl border-2 border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 text-lg text-[var(--theme-muted)]">
              {rules.map((rule) => (
                <li key={rule} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[var(--theme-accent)]" aria-hidden="true" />
                  {rule}
                </li>
              ))}
            </ul>

            {comboItens.length > 0 ? (
              <div className="rounded-2xl border-2 border-[var(--theme-border)] bg-white p-4">
                <h2 className="text-xl font-extrabold text-[var(--theme-text)]">O combo já vem pronto</h2>
                <ul className="mt-3 space-y-1 text-lg text-[var(--theme-muted)]">
                  {comboItens.map((item) => (
                    <li key={item.nome}>
                      {item.quantidade} {item.nome}
                    </li>
                  ))}
                </ul>
              </div>
            ) : saboresSugeridos.length > 0 ? (
              <div className="rounded-2xl border-2 border-[var(--theme-border)] bg-white p-4">
                <h2 className="text-xl font-extrabold text-[var(--theme-text)]">Sabores que você pode escolher</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {saboresSugeridos.map((sabor) => (
                    <li key={sabor} className="rounded-full bg-[var(--theme-surface)] px-4 py-2 text-base font-semibold text-[var(--theme-text)]">
                      {sabor}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-2xl border-2 border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 sm:p-4">
              <h2 className="mb-3 text-xl font-extrabold text-[var(--theme-text)]">Quero pedir</h2>
              <AddToCartControls
                productId={produto.id}
                productName={produto.nome}
                siteTheme={businessStatus.siteTheme}
                minimumQuantity={produto.productType?.minQuantity}
                usesMinimumQuantity={Boolean(produto.productType?.allowsMultiple && produto.productType?.minQuantity)}
              />
            </div>
          </div>
        </section>
      </div>

      <FloatingCart
        siteTheme={businessStatus.siteTheme}
        whatsappUrl={whatsappUrl}
        businessStatus={{
          isOpen: businessStatus.isOpen,
          message: businessStatus.message,
          minimumLeadHours: businessStatus.minimumLeadHours,
          operationSchedule: businessStatus.operationSchedule,
        }}
      />
    </div>
  );
}
