import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowLeft, BadgePercent, CheckCircle2, ShoppingCart } from "lucide-react";

import { AddToCartControls, FloatingCart } from "@/components/cart-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getFullStoreStatus } from "@/lib/business-hours";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/pedidos";
import { getProdutoComboItens, PRODUCT_CATEGORY_LABEL } from "@/lib/produtos";
import { normalizeSaboresList } from "@/lib/sabores";
import { cn } from "@/lib/utils";

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
  const themeStyle = {
    "--theme-accent": isDefaultTheme ? "#e000cf" : "#1b7f31",
    "--theme-surface": isDefaultTheme ? "#fff0fc" : "#fbfff0",
    "--theme-border": isDefaultTheme ? "#f4a8eb" : "#dbe7b6",
    "--theme-text": isDefaultTheme ? "#641052" : "#0b3d18",
    "--theme-muted": isDefaultTheme ? "#72506b" : "#456148",
  } as CSSProperties;

  return (
    <main
      style={themeStyle}
      className={cn(
        "px-4 py-6 sm:px-6 lg:px-8",
        isDefaultTheme && "bg-[linear-gradient(180deg,#fff7fd,#f4fffd_52%,#fff0fc)]",
      )}
    >
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className={cn("overflow-hidden rounded-[2rem] border border-[var(--theme-border)] bg-white", isDefaultTheme ? "shadow-[0_22px_70px_rgba(232,0,217,0.14)]" : "shadow-[0_22px_70px_rgba(27,94,32,0.14)]")}>
          <div className="relative aspect-[4/3] bg-[var(--theme-surface)]">
            <Image
              src={produto.imagemBase64}
              alt={produto.nome}
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <Button
            asChild
            variant="outline"
            className="w-fit rounded-full border-[var(--theme-border)] text-[var(--theme-accent)] hover:bg-[var(--theme-surface)]"
          >
            <Link href="/cardapio">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cardápio
            </Link>
          </Button>

          <Card className={cn("border-[var(--theme-border)] bg-white/95", isDefaultTheme ? "shadow-[0_22px_70px_rgba(232,0,217,0.12)]" : "shadow-[0_22px_70px_rgba(27,94,32,0.12)]")}>
            <CardContent className="space-y-5 p-6 sm:p-8">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--theme-surface)] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[var(--theme-accent)]">
                    {produto.productType?.name ||
                      PRODUCT_CATEGORY_LABEL[produto.categoria as keyof typeof PRODUCT_CATEGORY_LABEL]}
                  </span>
                  {discountPercent > 0 ? (
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.18em]", isDefaultTheme ? "bg-[#e9fbf8] text-[#8f147b]" : "bg-[#fff3a8] text-[#735600]")}>
                      <BadgePercent className="h-3.5 w-3.5" />
                      {discountPercent}% off
                    </span>
                  ) : null}
                </div>

                <h1 className="text-3xl font-black tracking-tight text-[var(--theme-text)] sm:text-4xl">
                  {produto.nome}
                </h1>
                <p className="text-sm leading-7 text-[var(--theme-muted)]">{produto.descricao}</p>

                <div>
                  {discountPercent > 0 ? (
                    <p className="text-sm font-semibold text-slate-400 line-through">
                      {formatCurrency(price)}
                    </p>
                  ) : null}
                  <p className="text-3xl font-black text-[var(--theme-text)]">
                    {formatCurrency(displayPrice)}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 text-sm text-[var(--theme-muted)]">
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--theme-accent)]" />
                  {produto.totalUnidades} unidades por item adicionado.
                </p>
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--theme-accent)]" />
                  Até {produto.maxTiposSalgado} tipos diferentes por item.
                </p>
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--theme-accent)]" />
                  Pagamento {produto.permitePagamentoParcial ? "de 50% ou 100%" : "integral"} no carrinho.
                </p>
              </div>

              {comboItens.length > 0 ? (
                <div className="rounded-2xl border border-[var(--theme-border)] bg-white p-4">
                  <p className="text-sm font-black text-[var(--theme-text)]">Composição fixa</p>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    {comboItens.map((item) => (
                      <p key={item.nome}>
                        {item.nome}: {item.quantidade} un
                      </p>
                    ))}
                  </div>
                </div>
              ) : saboresSugeridos.length > 0 ? (
                <div className="rounded-2xl border border-[var(--theme-border)] bg-white p-4">
                  <p className="text-sm font-black text-[var(--theme-text)]">Sugestões de tipos</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {saboresSugeridos.map((sabor) => (
                      <span
                        key={sabor}
                        className="rounded-full bg-[var(--theme-surface)] px-3 py-1 text-xs font-semibold text-[var(--theme-muted)]"
                      >
                        {sabor}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-black text-[var(--theme-text)]">
                  <ShoppingCart className="h-4 w-4" />
                  Adicionar ao carrinho
                </div>
                <AddToCartControls productId={produto.id} siteTheme={businessStatus.siteTheme} />
              </div>
            </CardContent>
          </Card>
        </section>
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
    </main>
  );
}
