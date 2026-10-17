import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowLeft } from "lucide-react";

import { AddToCartControls, FloatingCart } from "@/components/cart-ui";
import { getFullStoreStatus } from "@/lib/business-hours";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/pedidos";
import { getProdutoComboItens, shortProductDescription } from "@/lib/produtos";
import { normalizeSaboresList } from "@/lib/sabores";
import { buildStoreNotice } from "@/lib/store-notice";

export const dynamic = "force-dynamic";

// Identidade única da Vizinha (magenta do logo). Os temas sazonais mudam só os textos.
const ACCENTS: Record<string, string> = {
  PADRAO: "#8a0f78",
  NAMORADOS: "#8a0f78",
  SAO_JOAO: "#8a0f78",
  COPA: "#8a0f78",
};

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
  const notice = buildStoreNotice({
    operationSchedule: businessStatus.operationSchedule,
    closedByOwner: businessStatus.closedByOwner,
  });
  const minimum = produto.productType?.allowsMultiple ? produto.productType.minQuantity : null;

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
      ? "Pode pagar metade agora (50%) ou o valor todo."
      : "O pagamento é do valor todo.",
  ];

  return (
    <div
      style={{ "--accent": ACCENTS[businessStatus.siteTheme] ?? ACCENTS.COPA } as CSSProperties}
      className="px-4 pb-28 pt-6 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          href="/cardapio"
          className="inline-flex min-h-12 items-center gap-2 text-lg font-bold text-[var(--accent)] underline underline-offset-4"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          Voltar ao cardápio
        </Link>

        {notice ? (
          <div role="status" className="border-l-4 border-amber-700 bg-amber-50 p-4 text-slate-900">
            <p className="text-lg font-extrabold">{notice.title}</p>
            <p className="mt-1 text-lg">{notice.text}</p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-2xl border border-slate-300 bg-slate-100">
            <Image src={produto.imagemBase64} alt={`Foto de ${produto.nome}`} fill unoptimized className="object-cover" />
          </div>

          <div className="min-w-0 space-y-6">
            <div className="space-y-2">
              {discountPercent > 0 ? (
                <p className="text-base font-bold text-[var(--accent)]">Promoção: você economiza {formatCurrency(price - promotionalPrice)}</p>
              ) : null}
              <h1 className="text-3xl font-extrabold leading-tight text-slate-900 sm:text-4xl">{produto.nome}</h1>
              <p className="flex flex-wrap items-baseline gap-x-2">
                {discountPercent > 0 ? (
                  <span className="text-lg text-slate-700 line-through">
                    <span className="sr-only">Preço antes: </span>
                    {formatCurrency(price)}
                  </span>
                ) : null}
                <span className="text-4xl font-extrabold text-[var(--accent)]">
                  <span className="sr-only">Preço: </span>
                  {formatCurrency(displayPrice)}
                </span>
                {minimum ? <span className="text-lg text-slate-700">a cada {produto.totalUnidades} salgados</span> : null}
              </p>
              {shortProductDescription(produto.descricao, produto.nome, minimum) ? (
                <p className="text-lg leading-relaxed text-slate-800">{shortProductDescription(produto.descricao, produto.nome, minimum)}</p>
              ) : null}
            </div>

            <ul className="space-y-1 border-t border-brand-soft pt-4 text-lg text-ink">
              {rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>

            {comboItens.length > 0 ? (
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">O combo já vem pronto</h2>
                <ul className="mt-2 space-y-1 text-lg text-slate-800">
                  {comboItens.map((item) => (
                    <li key={item.nome}>
                      {item.quantidade} {item.nome}
                    </li>
                  ))}
                </ul>
              </div>
            ) : saboresSugeridos.length > 0 ? (
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Sabores</h2>
                <p className="mt-2 text-lg text-slate-800">{saboresSugeridos.join(", ")}.</p>
              </div>
            ) : null}

            <div className="vz-card rounded-3xl border border-brand-soft p-4 shadow-md shadow-brand/10">
              <h2 className="mb-3 text-xl font-extrabold text-slate-900">Quero pedir</h2>
              <AddToCartControls
                productId={produto.id}
                productName={produto.nome}
                siteTheme={businessStatus.siteTheme}
                minimumQuantity={produto.productType?.minQuantity}
                usesMinimumQuantity={Boolean(produto.productType?.allowsMultiple && produto.productType?.minQuantity)}
              />
            </div>
          </div>
        </div>
      </div>

      <FloatingCart
        siteTheme={businessStatus.siteTheme}
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
