import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BadgePercent, Clock3, Flame, Heart, Star, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AddToCartControls, FloatingCart } from "@/components/cart-ui";
import { prisma } from "@/lib/db";
import { getFullStoreStatus } from "@/lib/business-hours";
import { formatCurrency } from "@/lib/pedidos";
import { getProdutoComboItens, PRODUCT_CATEGORY_LABEL } from "@/lib/produtos";
import type { StoreSiteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import type { CartAudience } from "@/lib/cart";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cardápio | Vizinha Salgateria",
  description: "Monte seu pedido e finalize o pagamento online na Vizinha Salgateria.",
};

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
    }));
  } catch (error) {
    console.error("GET produtos cardapio page error", error);
    return [];
  }
}

function ProductCard({
  produto,
  siteTheme,
  audience = "VIZINHA",
}: {
  produto: Awaited<ReturnType<typeof getProdutos>>[number];
  siteTheme: StoreSiteTheme;
  audience?: CartAudience;
}) {
  const isCombo = String(produto.categoria) === "COMBO" && produto.comboItens.length > 0;
  const discountPercent = produto.emPromocao ? Number(produto.descontoPercentual || 0) : 0;
  const promotionalPrice = Number((produto.preco * (1 - discountPercent / 100)).toFixed(2));
  const isValentinesTheme = siteTheme === "NAMORADOS";
  const isSaoJoaoTheme = siteTheme === "SAO_JOAO";
  const isDefaultTheme = siteTheme === "PADRAO";

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-[2rem] border bg-white transition duration-300 hover:-translate-y-1",
        isValentinesTheme
          ? "border-[#f4b6c5] shadow-[0_20px_60px_rgba(190,18,60,0.16)]"
          : isDefaultTheme
            ? "border-[#f4a8eb] shadow-[0_20px_60px_rgba(232,0,217,0.16)]"
            : "border-[#dbe7b6] shadow-[0_20px_60px_rgba(27,94,32,0.16)]"
      )}
    >
      <div
        className={cn(
          "relative aspect-[4/3] overflow-hidden",
          isValentinesTheme
            ? "bg-[linear-gradient(135deg,#881337,#e11d48_52%,#f9a8d4)]"
            : isDefaultTheme
              ? "bg-[linear-gradient(135deg,#e800d9,#ff6bea_54%,#bff2ec)]"
              : "bg-[linear-gradient(135deg,#1b5e20,#2e7d32_48%,#fdd835)]"
        )}
      >
        <Image
          src={produto.imagemBase64}
          alt={produto.nome}
          fill
          unoptimized
          className="object-cover transition duration-500 group-hover:scale-105"
        />

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.28))]" />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
          <div className="flex flex-col gap-2">
            {produto.emPromocao && (
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] shadow-lg",
                  isValentinesTheme
                    ? "bg-[#ffe4ec] text-[#9f1239]"
                    : isDefaultTheme
                      ? "bg-[#fff0fc] text-[#a31391]"
                      : "bg-[#fedf00] text-[#0b5d1e]"
                )}
              >
                Promoção {discountPercent}%
              </span>
            )}
            <span
              className={cn(
                "w-fit rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] backdrop-blur",
                isDefaultTheme ? "text-[#a31391]" : "text-[#0b5d1e]",
              )}
            >
              {produto.productType?.name ||
                PRODUCT_CATEGORY_LABEL[produto.categoria as keyof typeof PRODUCT_CATEGORY_LABEL]}
            </span>
          </div>

          <div
            className={cn(
              "rounded-[1.4rem] px-4 py-2 text-right text-white shadow-xl backdrop-blur",
              isValentinesTheme
                ? "bg-[#5f1029]/90"
                : isDefaultTheme
                  ? "bg-[#78145f]/90"
                  : "bg-[#0b3d0b]/90"
            )}
          >
            <p
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.24em]",
                isDefaultTheme ? "text-[#bff2ec]" : "text-[#fff3a8]",
              )}
            >
              Preço
            </p>
            {discountPercent > 0 ? (
              <>
                <p className="text-xs text-white/60 line-through">{formatCurrency(produto.preco)}</p>
                <p className="text-xl font-black">{formatCurrency(promotionalPrice)}</p>
              </>
            ) : (
              <p className="text-xl font-black">{formatCurrency(produto.preco)}</p>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-1 flex-col gap-4 p-5",
          isValentinesTheme
            ? "bg-[linear-gradient(180deg,#ffffff,#fff1f5)]"
            : isDefaultTheme
              ? "bg-[linear-gradient(180deg,#ffffff,#fff2fc)]"
              : "bg-[linear-gradient(180deg,#ffffff,#f8fde8)]"
        )}
      >
        <div className="space-y-2">
          <h2 className={cn("text-xl font-black tracking-tight", isDefaultTheme ? "text-[#641052]" : "text-[#0b2d16]")}>
            {produto.nome}
          </h2>
          <p className={cn("text-sm leading-6", isDefaultTheme ? "text-[#72506b]" : "text-[#456148]")}>{produto.descricao}</p>
        </div>

        <div
          className={cn(
            "grid gap-2 rounded-[1.4rem] p-4 text-sm",
            isValentinesTheme
              ? "bg-[#fff5f8] text-[#7a3149]"
              : isDefaultTheme
                ? "bg-[#e9fbf8] text-[#641052]"
                : "bg-[#f3f9dc] text-[#35553d]"
          )}
        >
          <span>{produto.productType?.allowsMultiple && produto.productType.minQuantity ? `A partir de ${produto.productType.minQuantity} unidades` : `${produto.totalUnidades} unidades`}</span>
          <span>{produto.productType?.allowsMultiple && produto.productType.minQuantity ? `Até ${produto.maxTiposSalgado} tipos por lote de ${produto.productType.minQuantity} unidades` : `Até ${produto.maxTiposSalgado} tipos diferentes`}</span>
          <span>
            {produto.permitePagamentoParcial ? "Pagamento de 50% ou 100%" : "Pagamento integral"}
          </span>
          {isCombo ? (
            <span>
              Combo fixo:{" "}
              {produto.comboItens.map((item) => `${item.nome} (${item.quantidade} un)`).join(", ")}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge className={isDefaultTheme ? "border-[#f4a8eb] bg-[#fff0fc] text-[#a31391]" : "border-[#dbe7b6] bg-[#f8fde8] text-[#0b5d1e]"}>
            {produto.emPromocao ? "Em destaque" : "Disponível"}
          </Badge>
          {produto.emPromocao && (
            <div className={cn("flex items-center gap-1 text-sm font-bold", isDefaultTheme ? "text-[#e000cf]" : "text-[#c79300]")}>
              <Flame className="h-4 w-4" />
               Promoção 
            </div>
          )}
          {isCombo ? (
            <div
              className={cn(
                "flex items-center gap-1 text-sm font-bold",
                isValentinesTheme
                  ? "text-[#be123c]"
                  : isDefaultTheme
                    ? "text-[#d000c1]"
                    : "text-[#0b5d1e]"
              )}
            >
              {isValentinesTheme ? <Heart className="h-4 w-4" /> : isDefaultTheme ? <Star className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
              {isValentinesTheme
                ? "Especial Dia dos Namorados"
                : isSaoJoaoTheme
                  ? "Especial de São João"
                  : isDefaultTheme
                    ? "Especial da Vizinha"
                    : "Edição Copa"}
            </div>
          ) : null}
        </div>

        <AddToCartControls productId={produto.id} siteTheme={siteTheme} audience={audience} minimumQuantity={audience === "CONFEITEIRA" ? produto.quantidadeMinimaConfeiteira : produto.productType?.minQuantity} usesMinimumQuantity={audience === "CONFEITEIRA" ? Boolean(produto.quantidadeMinimaConfeiteira) : Boolean(produto.productType?.allowsMultiple && produto.productType?.minQuantity)} />

        <Link
          href={`/pedido/${produto.slug}`}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-black uppercase tracking-[0.18em] transition",
            isValentinesTheme
              ? "border-[#be123c] text-[#be123c] hover:bg-[#fff1f5]"
              : isSaoJoaoTheme
                ? "border-[#cc0000] text-[#cc0000] hover:bg-[#fff0c2]"
                : isDefaultTheme
                  ? "border-[#e000cf] text-[#a31391] hover:bg-[#fff0fc]"
                  : "border-[#1b7f31] text-[#1b7f31] hover:bg-[#f7fde7]"
          )}
        >
          Montar detalhes
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export default async function CardapioPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const audience: CartAudience = (await searchParams).area === "confeiteira" ? "CONFEITEIRA" : "VIZINHA";
  const produtos = await getProdutos(audience);
  const businessStatus = await getFullStoreStatus();
  const destaque =
    produtos.find((produto) => produto.id === businessStatus.featuredProductId) ||
    produtos[0] ||
    null;
  const siteTheme = businessStatus.siteTheme;
  const isValentinesTheme = siteTheme === "NAMORADOS";
  const isSaoJoaoTheme = siteTheme === "SAO_JOAO";
  const isDefaultTheme = siteTheme === "PADRAO";

  return (
    <main
      className={cn(
        "px-4 py-6 sm:px-6 lg:px-8",
        isDefaultTheme && "bg-[linear-gradient(180deg,#fff7fd_0%,#f4fffd_52%,#fff0fc_100%)]",
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {!businessStatus.isOpen ? (
          <section className="rounded-[1.8rem] border border-yellow-300 bg-[linear-gradient(135deg,#fff8bf,#fff4dc)] p-5 shadow-[0_16px_40px_rgba(234,179,8,0.18)]">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-800">
              Aviso de atendimento
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-950">
              {businessStatus.message} Se entrar agora para pedir, a loja pode estar fechada no
              momento.
            </p>
          </section>
        ) : null}

        <section
          className={cn(
            "overflow-hidden rounded-[2.3rem] text-white",
            isValentinesTheme
              ? "bg-[#5f1029] shadow-[0_30px_100px_rgba(190,18,60,0.26)]"
              : isSaoJoaoTheme
                ? "bg-[#8B4513] shadow-[0_30px_100px_rgba(139,69,19,0.28)]"
                : isDefaultTheme
                   ? "bg-[#9f128e] shadow-[0_30px_100px_rgba(232,0,217,0.24)]"
                  : "bg-[#0b3314] shadow-[0_30px_100px_rgba(11,51,20,0.32)]"
          )}
        >
          <div className="relative">
            <div
              className={cn(
                "absolute inset-0",
                isValentinesTheme
                  ? "bg-[radial-gradient(circle_at_top_left,#f9a8d455_0,transparent_24%),radial-gradient(circle_at_100%_20%,#fb718560_0,transparent_35%),linear-gradient(135deg,#5f1029_0%,#be123c_48%,#881337_78%,#f9a8d4_120%)]"
                  : isSaoJoaoTheme
                    ? "bg-[linear-gradient(45deg,rgba(255,215,0,.12)_25%,transparent_25%,transparent_75%,rgba(255,215,0,.12)_75%),linear-gradient(45deg,rgba(255,215,0,.12)_25%,transparent_25%,transparent_75%,rgba(255,215,0,.12)_75%),linear-gradient(135deg,#8B4513_0%,#CC0000_38%,#FF8C00_72%,#006400_120%)] bg-[length:36px_36px,36px_36px,auto] bg-[position:0_0,18px_18px,0_0]"
                    : isDefaultTheme
                       ? "bg-[radial-gradient(circle_at_top_left,#bff2ec88_0,transparent_28%),radial-gradient(circle_at_100%_15%,#ffffff70_0,transparent_30%),linear-gradient(135deg,#8f147b_0%,#e800d9_48%,#ff6bea_76%,#bff2ec_125%)]"
                      : "bg-[radial-gradient(circle_at_top_left,#fdd83555_0,transparent_24%),radial-gradient(circle_at_100%_20%,#4caf5060_0,transparent_35%),linear-gradient(135deg,#0b3314_0%,#146b2e_45%,#0d431c_75%,#f4c600_120%)]"
              )}
            />
            {isSaoJoaoTheme ? (
              <div className="absolute inset-x-0 top-0 flex h-10 overflow-hidden" aria-hidden="true">
                {["#FFD700", "#CC0000", "#006400", "#FF8C00", "#FFD700", "#CC0000", "#006400", "#FF8C00"].map((color, index) => (
                  <span
                    key={`${color}-${index}`}
                    className="h-0 w-0 border-l-[18px] border-r-[18px] border-t-[32px] border-l-transparent border-r-transparent"
                    style={{ borderTopColor: color }}
                  />
                ))}
              </div>
            ) : null}

            <div className="relative grid gap-8 px-6 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-10">
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 overflow-hidden rounded-full border-4 border-white/20 bg-white shadow-xl">
                    <Image
                      src="/vizinha-logo.png"
                      alt="Logo Vizinha Salgateria"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <p className={cn("text-sm font-black uppercase tracking-[0.24em]", isDefaultTheme ? "text-[#d9fffa]" : "text-[#fff3a8]")}>
                      {audience === "CONFEITEIRA" ? "Vizinha para Confeiteiras" : "Vizinha Salgateria"}
                    </p>
                    <p className="text-sm text-white/72">
                      {isDefaultTheme
                        ? "O sabor que mora ao lado"
                        : isValentinesTheme
                        ? "Edição especial de Dia dos Namorados"
                        : isSaoJoaoTheme
                          ? "São João da Vizinha 🎪 🌽 ⭐ 🎉"
                          : "Edição especial em clima de Copa"}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Badge
                    className={cn(
                      "w-fit border-white/10",
                      isValentinesTheme
                        ? "bg-[#ffe4ec] text-[#9f1239]"
                        : isDefaultTheme
                          ? "bg-white text-[#a31391]"
                          : "bg-[#fedf00] text-[#0b5d1e]"
                    )}
                  >
                    {audience === "CONFEITEIRA"
                      ? "Preços especiais para confeiteiras"
                      : isDefaultTheme
                      ? "Feito pela Vizinha"
                      : isValentinesTheme
                        ? "Especial para presentear"
                        : "Encomendas online"}
                  </Badge>

                  <h1 className="max-w-2xl text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-5xl lg:text-6xl">
                    {audience === "CONFEITEIRA"
                      ? "Selecione produtos com as condições especiais para confeiteiras e finalize tudo pelo site."
                      : isDefaultTheme
                      ? "Sabor de vizinha, carinho em cada pedido"
                      : isValentinesTheme
                      ? "Amor na mesa, sabor para dividir"
                      : isSaoJoaoTheme
                        ? "São João da Vizinha"
                        : "Brasil em campo, salgado na mesa"}
                  </h1>

                  <p className="max-w-2xl text-sm leading-7 text-white/78 sm:text-base">
                    {audience === "CONFEITEIRA"
                      ? "Atendimento para confeiteiras"
                      : isDefaultTheme
                      ? "Escolha seus salgados favoritos, monte a encomenda do seu jeito e finalize tudo pelo site."
                      : isValentinesTheme
                      ? "Escolha os favoritos do casal, monte uma encomenda especial e finalize tudo pelo site."
                      : isSaoJoaoTheme
                        ? "Bandeirinhas no alto, salgado na mesa e pedido fechado no carrinho para o arraiá."
                        : "Escolha seu produto, monte o pedido, veja os combos especiais e finalize tudo sem sair do site."}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
                    <BadgePercent className={cn("h-5 w-5", isDefaultTheme ? "text-[#bff2ec]" : "text-[#fff3a8]")} />
                    <p className="mt-3 text-sm font-black uppercase tracking-[0.18em]">
                      50% ou 100%
                    </p>
                    <p className="mt-2 text-sm text-white/72">
                      Dependendo do produto, você pode reservar com metade ou quitar tudo.
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
                    <Clock3 className={cn("h-5 w-5", isDefaultTheme ? "text-[#bff2ec]" : "text-[#fff3a8]")} />
                    <p className="mt-3 text-sm font-black uppercase tracking-[0.18em]">
                      Horários
                    </p>
                    <p className="mt-2 text-sm text-white/72">
                      De terça a sábado, das 10h às 17h. Aos domingos, das 9h às 13h. Fechamos às segundas-feiras.
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
                    <Star className={cn("h-5 w-5", isDefaultTheme ? "text-[#bff2ec]" : "text-[#fff3a8]")} />
                    <p className="mt-3 text-sm font-black uppercase tracking-[0.18em]">
                      {isDefaultTheme
                        ? "Qualidade da Vizinha"
                        : isValentinesTheme
                          ? "Para dividir"
                          : "Combos especiais"}
                    </p>
                    <p className="mt-2 text-sm text-white/72">
                      {isDefaultTheme
                        ? "Produtos preparados com cuidado para deixar seus encontros ainda mais gostosos."
                        : isValentinesTheme
                        ? "Produtos em destaque para o Dia dos Namorados, presentes e momentos a dois."
                        : "Produtos podem ter quantidades fixas, ideais para a Copa e datas especiais."}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                {destaque ? (
                  <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/6 p-3 backdrop-blur">
                    <ProductCard produto={destaque} siteTheme={siteTheme} />
                  </div>
                ) : (
                  <Card className="border-white/10 bg-white/8 text-white shadow-none">
                    <CardContent className="p-8">
                      <p className="text-lg font-bold">Estamos montando o cardápio.</p>
                      <p className="mt-2 text-sm text-white/72">
                        Em breve os produtos da Vizinha aparecerão aqui.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </section>

        {produtos.length === 0 ? (
          <section
            className={cn(
              "rounded-[2rem] border bg-white/90 p-10 text-center",
              isDefaultTheme
                ? "border-[#f4a8eb] shadow-[0_18px_60px_rgba(232,0,217,0.10)]"
                : "border-[#dbe7b6] shadow-[0_18px_60px_rgba(27,94,32,0.1)]",
            )}
          >
            <p className={cn("text-lg font-bold", isDefaultTheme ? "text-[#8f147b]" : "text-[#0b5d1e]")}>O cardápio ainda está sendo montado.</p>
            <p className={cn("mt-2 text-sm", isDefaultTheme ? "text-[#72506b]" : "text-[#456148]")}>
              Em breve, novos produtos aparecerão aqui.
            </p>
          </section>
        ) : (
          <section className="space-y-5">
            <div
              className={cn(
                "flex flex-col gap-3 rounded-[2rem] px-6 py-6 text-white",
                isValentinesTheme
                  ? "bg-[linear-gradient(135deg,#5f1029,#be123c_58%,#f9a8d4)] shadow-[0_24px_80px_rgba(190,18,60,0.22)]"
                  : isDefaultTheme
                    ? "bg-[linear-gradient(135deg,#8f147b,#e800d9_62%,#bff2ec)] shadow-[0_24px_80px_rgba(232,0,217,0.20)]"
                    : "bg-[linear-gradient(135deg,#0b3314,#146b2e_52%,#f4c600)] shadow-[0_24px_80px_rgba(11,51,20,0.28)]"
              )}
            >
              <p className={cn("text-xs font-black uppercase tracking-[0.24em]", isDefaultTheme ? "text-[#d9fffa]" : "text-[#fff3a8]")}>
                Cardápio
              </p>
              <div>
                <h2 className="text-3xl font-black tracking-tight">Produtos para encomenda</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/78">
                  {isValentinesTheme
                    ? "Os produtos destacados entram no clima do Dia dos Namorados, com opções para dividir ou presentear."
                    : "Cada produto já traz suas regras de quantidade, tipos permitidos, pagamento e, se for combo, a composição fixa."}
                </p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {produtos.map((produto) => (
                <ProductCard key={produto.id} produto={produto} siteTheme={siteTheme} audience={audience} />
              ))}
            </div>
          </section>
        )}
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
    </main>
  );
}
