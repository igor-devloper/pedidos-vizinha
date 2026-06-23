import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgePercent, CheckCircle2, ShoppingCart } from "lucide-react";

import { AddToCartControls, FloatingCart } from "@/components/cart-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getFullStoreStatus } from "@/lib/business-hours";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/pedidos";
import { getProdutoComboItens, PRODUCT_CATEGORY_LABEL } from "@/lib/produtos";
import { normalizeSaboresList } from "@/lib/sabores";

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

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="overflow-hidden rounded-[2rem] border border-[#dbe7b6] bg-white shadow-[0_22px_70px_rgba(27,94,32,0.14)]">
          <div className="relative aspect-[4/3] bg-[#f8fde8]">
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
            className="w-fit rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
          >
            <Link href="/cardapio">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cardapio
            </Link>
          </Button>

          <Card className="border-[#dbe7b6] bg-white/95 shadow-[0_22px_70px_rgba(27,94,32,0.12)]">
            <CardContent className="space-y-5 p-6 sm:p-8">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#f3f9dc] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#0b5d1e]">
                    {produto.productType?.name ||
                      PRODUCT_CATEGORY_LABEL[produto.categoria as keyof typeof PRODUCT_CATEGORY_LABEL]}
                  </span>
                  {discountPercent > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3a8] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#735600]">
                      <BadgePercent className="h-3.5 w-3.5" />
                      {discountPercent}% off
                    </span>
                  ) : null}
                </div>

                <h1 className="text-3xl font-black tracking-tight text-[#0b2d16] sm:text-4xl">
                  {produto.nome}
                </h1>
                <p className="text-sm leading-7 text-[#456148]">{produto.descricao}</p>

                <div>
                  {discountPercent > 0 ? (
                    <p className="text-sm font-semibold text-slate-400 line-through">
                      {formatCurrency(price)}
                    </p>
                  ) : null}
                  <p className="text-3xl font-black text-[#0b3d18]">
                    {formatCurrency(displayPrice)}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-[#dfeab9] bg-[#fbfff0] p-4 text-sm text-[#35553d]">
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1b7f31]" />
                  {produto.totalUnidades} unidades por item adicionado.
                </p>
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1b7f31]" />
                  Ate {produto.maxTiposSalgado} tipos diferentes por item.
                </p>
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1b7f31]" />
                  Pagamento {produto.permitePagamentoParcial ? "de 50% ou 100%" : "integral"} no carrinho.
                </p>
              </div>

              {comboItens.length > 0 ? (
                <div className="rounded-2xl border border-[#dfeab9] bg-white p-4">
                  <p className="text-sm font-black text-[#0b3d18]">Composicao fixa</p>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    {comboItens.map((item) => (
                      <p key={item.nome}>
                        {item.nome}: {item.quantidade} un
                      </p>
                    ))}
                  </div>
                </div>
              ) : saboresSugeridos.length > 0 ? (
                <div className="rounded-2xl border border-[#dfeab9] bg-white p-4">
                  <p className="text-sm font-black text-[#0b3d18]">Sugestoes de tipos</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {saboresSugeridos.map((sabor) => (
                      <span
                        key={sabor}
                        className="rounded-full bg-[#f3f9dc] px-3 py-1 text-xs font-semibold text-[#35553d]"
                      >
                        {sabor}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-[#d6e7a2] bg-[#fbfff0] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-black text-[#0b3d18]">
                  <ShoppingCart className="h-4 w-4" />
                  Adicionar ao carrinho
                </div>
                <AddToCartControls productId={produto.id} />
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
      <FloatingCart
        businessStatus={{
          isOpen: businessStatus.isOpen,
          message: businessStatus.message,
          minimumLeadHours: businessStatus.minimumLeadHours,
        }}
      />
    </main>
  );
}
