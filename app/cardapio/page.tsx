import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";

import { AddToCartControls, FloatingCart } from "@/components/cart-ui";
import { getFullStoreStatus } from "@/lib/business-hours";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/pedidos";
import { getProdutoComboItens, shortProductDescription } from "@/lib/produtos";
import type { CartAudience } from "@/lib/cart";
import { normalizeSaboresList } from "@/lib/sabores";
import { buildStoreNotice } from "@/lib/store-notice";
import { describeWeeklyHours } from "@/lib/whatsapp-schedule";
import type { StoreSiteTheme } from "@/lib/site-theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cardápio | Vizinha Salgateria",
  description: "Escolha seus salgados, monte o pedido e finalize pelo site.",
};

type Produto = Awaited<ReturnType<typeof getProdutos>>[number];

async function getProdutos(audience: CartAudience = "VIZINHA") {
  try {
    const produtos = await prisma.produto.findMany({
      where: { ativo: true, ...(audience === "CONFEITEIRA" ? { ativoConfeiteira: true } : {}) },
      orderBy: [{ emPromocao: "desc" }, { createdAt: "desc" }],
      include: { productType: true },
    });

    return produtos.map((produto) => ({
      ...produto,
      preco: audience === "CONFEITEIRA" ? Number(produto.precoConfeiteira) : Number(produto.preco),
      comboItens: getProdutoComboItens(produto as { comboItens?: unknown }),
      sabores: normalizeSaboresList(produto.saboresSugeridos),
    }));
  } catch (error) {
    console.error("GET produtos cardapio page error", error);
    return [];
  }
}

// Uma cor de destaque por tema, usada só em preços, links e botões (contraste de pelo menos 7:1 no branco).
// Identidade única da Vizinha (magenta do logo). Os temas sazonais mudam só os textos.
const ACCENTS: Record<string, string> = {
  PADRAO: "#8a0f78",
  NAMORADOS: "#8a0f78",
  SAO_JOAO: "#8a0f78",
  COPA: "#8a0f78",
};

const TAGLINES: Record<string, { eyebrow: string; lead: string }> = {
  PADRAO: {
    eyebrow: "O sabor que mora ao lado",
    lead: "Escolha seus salgados, diga quando quer receber e finalize aqui mesmo.",
  },
  NAMORADOS: {
    eyebrow: "Especial de Dia dos Namorados",
    lead: "Escolha os favoritos do casal e faça uma encomenda especial.",
  },
  SAO_JOAO: {
    eyebrow: "São João da Vizinha",
    lead: "Salgados para o arraiá. Escolha, encomende e pronto.",
  },
};

function quantityRules(produto: Produto) {
  const minimum = produto.productType?.allowsMultiple ? produto.productType.minQuantity : null;
  const lines: string[] = [];

  if (minimum) {
    lines.push(`Pedido mínimo: ${minimum} salgados.`);
    if (produto.precisaSelecaoDeTipos) {
      lines.push(`A cada ${minimum} salgados você escolhe até ${produto.maxTiposSalgado} sabores.`);
    }
  } else {
    lines.push(`Vem com ${produto.totalUnidades} salgados.`);
    if (produto.precisaSelecaoDeTipos && String(produto.categoria) !== "COMBO") {
      lines.push(`Você escolhe até ${produto.maxTiposSalgado} sabores diferentes.`);
    }
  }

  lines.push(
    produto.permitePagamentoParcial
      ? "Pode pagar metade agora (50%) ou o valor todo."
      : "O pagamento é do valor todo.",
  );
  return lines;
}

function ProductCard({
  produto,
  siteTheme,
  audience,
}: {
  produto: Produto;
  siteTheme: StoreSiteTheme;
  audience: CartAudience;
}) {
  const isCombo = String(produto.categoria) === "COMBO" && produto.comboItens.length > 0;
  const discountPercent = produto.emPromocao ? Number(produto.descontoPercentual || 0) : 0;
  const price = Number((produto.preco * (1 - discountPercent / 100)).toFixed(2));
  const minimum = audience === "CONFEITEIRA" ? produto.quantidadeMinimaConfeiteira : produto.productType?.minQuantity;
  const usesMinimum =
    audience === "CONFEITEIRA"
      ? Boolean(produto.quantidadeMinimaConfeiteira)
      : Boolean(produto.productType?.allowsMultiple && produto.productType?.minQuantity);

  return (
    <article
      aria-labelledby={`produto-${produto.id}`}
      className="vz-card flex h-full flex-col overflow-hidden rounded-3xl border border-brand-soft shadow-md shadow-brand/10"
    >
      <div className="relative aspect-[4/3] bg-brand-soft">
        <Image src={produto.imagemBase64} alt={`Foto de ${produto.nome}`} fill unoptimized className="object-cover" />
      </div>

      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="space-y-2">
          {discountPercent > 0 ? (
            <p className="text-base font-bold text-[var(--accent)]">Promoção: você economiza {formatCurrency(produto.preco - price)}</p>
          ) : null}
          <h2 id={`produto-${produto.id}`} className="text-2xl font-extrabold leading-tight text-slate-900">
            {produto.nome}
          </h2>
          <p className="flex flex-wrap items-baseline gap-x-2">
            {discountPercent > 0 ? (
              <span className="text-base text-slate-700 line-through">
                <span className="sr-only">Preço antes: </span>
                {formatCurrency(produto.preco)}
              </span>
            ) : null}
            <span className="text-3xl font-extrabold text-[var(--accent)]">
              <span className="sr-only">Preço: </span>
              {formatCurrency(price)}
            </span>
            {usesMinimum ? <span className="text-base text-slate-700">a cada {produto.totalUnidades} salgados</span> : null}
          </p>
          {shortProductDescription(produto.descricao, produto.nome, minimum) ? (
            <p className="text-base leading-relaxed text-slate-700">{shortProductDescription(produto.descricao, produto.nome, minimum)}</p>
          ) : null}
        </div>

        <ul className="space-y-1 border-t border-brand-soft pt-4 text-base text-ink">
          {quantityRules(produto).map((line) => (
            <li key={line}>{line}</li>
          ))}
          {isCombo ? (
            <li>
              <strong>O combo já vem pronto:</strong>{" "}
              {produto.comboItens.map((item) => `${item.quantidade} ${item.nome}`).join(", ")}.
            </li>
          ) : null}
        </ul>

        {produto.precisaSelecaoDeTipos && !isCombo && produto.sabores.length > 0 ? (
          <p className="text-base text-slate-800">
            <strong>Sabores: </strong>
            {produto.sabores.join(", ")}.
          </p>
        ) : null}

        <AddToCartControls
          productId={produto.id}
          productName={produto.nome}
          siteTheme={siteTheme}
          audience={audience}
          minimumQuantity={minimum}
          usesMinimumQuantity={usesMinimum}
        />

        <Link
          href={`/pedido/${produto.slug}`}
          className="inline-flex min-h-12 items-center justify-center text-base font-bold text-[var(--accent)] underline underline-offset-4"
        >
          Ver mais sobre {produto.nome}
        </Link>
      </div>
    </article>
  );
}

export default async function CardapioPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const audience: CartAudience = (await searchParams).area === "confeiteira" ? "CONFEITEIRA" : "VIZINHA";
  const [fetched, businessStatus] = await Promise.all([getProdutos(audience), getFullStoreStatus()]);
  const produtos = [...fetched].sort(
    (a, b) => Number(b.id === businessStatus.featuredProductId) - Number(a.id === businessStatus.featuredProductId),
  );
  const siteTheme = businessStatus.siteTheme;
  const accent = ACCENTS[siteTheme] ?? ACCENTS.COPA;
  const tagline = TAGLINES[siteTheme] ?? {
    eyebrow: "Edição especial",
    lead: "Escolha seu produto, monte o pedido e finalize sem sair do site.",
  };
  const notice = buildStoreNotice({
    operationSchedule: businessStatus.operationSchedule,
    closedByOwner: businessStatus.closedByOwner,
  });
  const weekly = describeWeeklyHours(businessStatus.operationSchedule);

  return (
    <div style={{ "--accent": accent } as CSSProperties} className="px-4 pb-28 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-slate-300 bg-white">
            <Image src="/vizinha-logo.png" alt="Logo da Vizinha Salgateria" fill className="object-cover" />
          </div>
          <div>
            <p className="text-base font-bold text-[var(--accent)]">
              {audience === "CONFEITEIRA" ? "Vizinha para Confeiteiras" : tagline.eyebrow}
            </p>
            <h1 className="text-3xl font-extrabold leading-tight text-slate-900 sm:text-4xl">Cardápio</h1>
          </div>
        </header>

        <p className="max-w-2xl text-lg leading-relaxed text-slate-800">
          {audience === "CONFEITEIRA" ? "Preços especiais para confeiteiras. Escolha os produtos e finalize pelo site." : tagline.lead}
        </p>

        {notice ? (
          <section role="status" className="border-l-4 border-amber-700 bg-amber-50 p-4 text-slate-900">
            <h2 className="text-lg font-extrabold">{notice.title}</h2>
            <p className="mt-1 text-lg">{notice.text}</p>
          </section>
        ) : null}

        <section id="produtos" aria-labelledby="titulo-produtos" className="space-y-5">
          <h2 id="titulo-produtos" className="sr-only">
            Produtos
          </h2>

          {produtos.length === 0 ? (
            <p className="rounded-2xl border border-slate-300 bg-white p-8 text-center text-xl font-bold text-slate-900">
              O cardápio está sendo montado. Em breve os produtos aparecem aqui.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {produtos.map((produto) => (
                <ProductCard key={produto.id} produto={produto} siteTheme={siteTheme} audience={audience} />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="info" className="grid grid-cols-1 gap-8 border-t border-slate-300 pt-8 md:grid-cols-2">
          <h2 id="info" className="sr-only">
            Horários e pagamento
          </h2>
          <div>
            <h3 className="text-xl font-extrabold text-slate-900">Horário de atendimento</h3>
            <ul className="mt-3 space-y-1 text-lg text-slate-800">
              {weekly.map((day) => (
                <li key={day.weekday} className="first-letter:uppercase">
                  {day.text}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-slate-900">Como pagar</h3>
            <p className="mt-3 text-lg text-slate-800">
              Você paga com Pix ou cartão. Dependendo do produto, pode reservar pagando 50% agora ou pagar tudo.
            </p>
          </div>
        </section>
      </div>

      <FloatingCart
        siteTheme={siteTheme}
        businessStatus={{
          isOpen: businessStatus.isOpen,
          message: businessStatus.message,
          minimumLeadHours: businessStatus.minimumLeadHours,
          operationSchedule: businessStatus.operationSchedule,
        }}
        audience={audience}
      />
    </div>
  );
}
