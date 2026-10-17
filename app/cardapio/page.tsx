import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Clock3, MessageCircle, Wallet } from "lucide-react";

import { AddToCartControls, FloatingCart } from "@/components/cart-ui";
import { getFullStoreStatus } from "@/lib/business-hours";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/pedidos";
import { cleanProductDescription, getProdutoComboItens } from "@/lib/produtos";
import type { CartAudience } from "@/lib/cart";
import { normalizeSaboresList } from "@/lib/sabores";
import { buildStoreNotice } from "@/lib/store-notice";
import { getWhatsAppOrderUrl } from "@/lib/whatsapp-link";
import { describeWeeklyHours } from "@/lib/whatsapp-schedule";
import { cn } from "@/lib/utils";
import type { StoreSiteTheme } from "@/lib/site-theme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cardápio | Vizinha Salgateria",
  description: "Escolha seus salgados, monte o pedido e finalize pelo site ou pelo WhatsApp.",
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

// Cores por tema. Todas as combinações de texto e fundo têm contraste de pelo menos 7:1.
const PALETTES = {
  PADRAO: {
    hero: "bg-[#6b0f5c]",
    heroText: "text-white",
    border: "border-[#c25bb4]",
    surface: "bg-[#fdf1fb]",
    title: "text-[#4a0a3f]",
    body: "text-[#3d2a39]",
    price: "text-[#6b0f5c]",
    link: "border-[#6b0f5c] text-[#6b0f5c] hover:bg-[#fdf1fb]",
  },
  NAMORADOS: {
    hero: "bg-[#5f1029]",
    heroText: "text-white",
    border: "border-[#e08aa3]",
    surface: "bg-[#fff1f5]",
    title: "text-[#4c0d20]",
    body: "text-[#3d2a30]",
    price: "text-[#8f0f33]",
    link: "border-[#8f0f33] text-[#8f0f33] hover:bg-[#fff1f5]",
  },
  SAO_JOAO: {
    hero: "bg-[#6b3410]",
    heroText: "text-white",
    border: "border-[#d8a35c]",
    surface: "bg-[#fff6e6]",
    title: "text-[#4a2408]",
    body: "text-[#3d3020]",
    price: "text-[#8f1111]",
    link: "border-[#8f1111] text-[#8f1111] hover:bg-[#fff6e6]",
  },
  COPA: {
    hero: "bg-[#0b3314]",
    heroText: "text-white",
    border: "border-[#8fb36a]",
    surface: "bg-[#f3f9e4]",
    title: "text-[#0b2d16]",
    body: "text-[#27402c]",
    price: "text-[#0f5223]",
    link: "border-[#0f5223] text-[#0f5223] hover:bg-[#f3f9e4]",
  },
} as const;

function getPalette(theme: StoreSiteTheme) {
  if (theme === "PADRAO" || theme === "NAMORADOS" || theme === "SAO_JOAO") return PALETTES[theme];
  return PALETTES.COPA;
}

const HERO_TEXT: Record<string, { title: string; subtitle: string }> = {
  PADRAO: {
    title: "Sabor de vizinha, carinho em cada pedido",
    subtitle: "Escolha seus salgados, diga quando quer receber e finalize aqui mesmo.",
  },
  NAMORADOS: {
    title: "Amor na mesa, sabor para dividir",
    subtitle: "Escolha os favoritos do casal e faça uma encomenda especial.",
  },
  SAO_JOAO: {
    title: "São João da Vizinha",
    subtitle: "Salgados para o arraiá. Escolha, encomende e pronto.",
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
      ? "Você pode pagar metade agora (50%) ou o valor todo."
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
  const palette = getPalette(siteTheme);
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
      className={cn("flex h-full flex-col overflow-hidden rounded-3xl border-2 bg-white shadow-lg", palette.border)}
    >
      <div className="relative aspect-[4/3] bg-slate-100">
        <Image src={produto.imagemBase64} alt={`Foto de ${produto.nome}`} fill unoptimized className="object-cover" />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-2">
          {produto.emPromocao && discountPercent > 0 ? (
            <p className={cn("inline-block rounded-full px-3 py-1 text-base font-bold", palette.surface, palette.price)}>
              Promoção: você economiza {formatCurrency(produto.preco - price)}
            </p>
          ) : null}
          <h2 id={`produto-${produto.id}`} className={cn("text-2xl font-extrabold leading-tight", palette.title)}>
            {produto.nome}
          </h2>
          <p className={cn("text-lg font-extrabold", palette.price)}>
            {discountPercent > 0 ? (
              <>
                <span className="mr-2 text-base font-medium text-slate-700 line-through">
                  <span className="sr-only">Preço antes: </span>
                  {formatCurrency(produto.preco)}
                </span>
                <span className="sr-only">Preço agora: </span>
              </>
            ) : null}
            <span className="text-3xl">{formatCurrency(price)}</span>
            {usesMinimum ? <span className="ml-1 text-base font-semibold"> a cada {produto.totalUnidades} salgados</span> : null}
          </p>
          <p className={cn("text-base leading-relaxed", palette.body)}>{cleanProductDescription(produto.descricao, minimum)}</p>
        </div>

        <ul className={cn("space-y-1 rounded-2xl p-4 text-base", palette.surface, palette.body)}>
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
          <div className={cn("text-base", palette.body)}>
            <p className="font-bold">Sabores que você pode escolher:</p>
            <p className="mt-1">{produto.sabores.join(", ")}.</p>
          </div>
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
          className={cn(
            "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 px-5 py-3 text-base font-bold transition",
            palette.link,
          )}
        >
          Ver mais sobre {produto.nome}
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
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
  const palette = getPalette(siteTheme);
  const hero = HERO_TEXT[siteTheme] ?? {
    title: "Brasil em campo, salgado na mesa",
    subtitle: "Escolha seu produto, monte o pedido e finalize sem sair do site.",
  };
  const whatsappUrl = getWhatsAppOrderUrl();
  const notice = buildStoreNotice({
    operationSchedule: businessStatus.operationSchedule,
    closedByOwner: businessStatus.closedByOwner,
  });
  const weekly = describeWeeklyHours(businessStatus.operationSchedule);

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className={cn("rounded-3xl p-6 sm:p-8", palette.hero, palette.heroText)}>
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-4 border-white/40 bg-white">
              <Image src="/vizinha-logo.png" alt="Logo da Vizinha Salgateria" fill className="object-cover" />
            </div>
            <p className="text-xl font-extrabold">
              {audience === "CONFEITEIRA" ? "Vizinha para Confeiteiras" : "Vizinha Salgateria"}
            </p>
          </div>

          <h1 className="mt-5 max-w-3xl text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
            {audience === "CONFEITEIRA" ? "Preços especiais para confeiteiras" : hero.title}
          </h1>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed">
            {audience === "CONFEITEIRA" ? "Escolha os produtos e finalize tudo pelo site." : hero.subtitle}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="#produtos"
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-white px-6 text-lg font-extrabold text-[#2b0a26] hover:bg-slate-100"
            >
              Ver os salgados
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </a>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#0b6b3a] px-6 text-lg font-extrabold text-white ring-2 ring-white hover:bg-[#095a30]"
            >
              <MessageCircle className="h-6 w-6" aria-hidden="true" />
              Pedir pelo WhatsApp
            </a>
          </div>
        </section>

        {notice ? (
          <section role="status" className="rounded-3xl border-2 border-[#a16207] bg-[#fff8db] p-5 text-[#3b2a00]">
            <h2 className="text-xl font-extrabold">{notice.title}</h2>
            <p className="mt-1 text-lg">{notice.text}</p>
          </section>
        ) : null}

        <section aria-labelledby="como-funciona" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <h2 id="como-funciona" className="sr-only">
            Informações importantes
          </h2>
          <div className={cn("rounded-3xl border-2 bg-white p-5", palette.border)}>
            <p className={cn("flex items-center gap-2 text-xl font-extrabold", palette.title)}>
              <Clock3 className="h-6 w-6" aria-hidden="true" />
              Horário de atendimento
            </p>
            <ul className={cn("mt-3 space-y-1 text-lg", palette.body)}>
              {weekly.map((day) => (
                <li key={day.weekday} className="first-letter:uppercase">{day.text}</li>
              ))}
            </ul>
          </div>
          <div className={cn("rounded-3xl border-2 bg-white p-5", palette.border)}>
            <p className={cn("flex items-center gap-2 text-xl font-extrabold", palette.title)}>
              <Wallet className="h-6 w-6" aria-hidden="true" />
              Como pagar
            </p>
            <p className={cn("mt-3 text-lg", palette.body)}>
              Pelo site você paga com Pix ou cartão. Dependendo do produto, pode reservar pagando 50% agora ou pagar tudo.
            </p>
            <p className={cn("mt-3 text-lg", palette.body)}>
              Prefere conversar? Clique em “Pedir pelo WhatsApp” e a gente anota seu pedido.
            </p>
          </div>
        </section>

        <section id="produtos" aria-labelledby="titulo-produtos" className="scroll-mt-4 space-y-4">
          <h2 id="titulo-produtos" className={cn("text-3xl font-extrabold", palette.title)}>
            Escolha seus salgados
          </h2>

          {produtos.length === 0 ? (
            <p className={cn("rounded-3xl border-2 bg-white p-8 text-center text-xl font-bold", palette.border, palette.title)}>
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
      </div>

      <FloatingCart
        siteTheme={siteTheme}
        whatsappUrl={whatsappUrl}
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
