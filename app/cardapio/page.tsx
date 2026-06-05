import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BadgePercent, Clock3, Flame, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/pedidos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cardápio | Vizinha Salgateria",
  description: "Monte seu pedido e finalize o pagamento online na Vizinha Salgateria.",
};

async function getProdutos() {
  try {
    const produtos = await prisma.produto.findMany({
      where: { ativo: true },
      orderBy: [{ emPromocao: "desc" }, { createdAt: "desc" }],
    });

    return produtos.map((produto) => ({
      ...produto,
      preco: Number(produto.preco),
    }));
  } catch (error) {
    console.error("GET produtos cardapio page error", error);
    return [];
  }
}

function ProductCard({
  produto,
}: {
  produto: Awaited<ReturnType<typeof getProdutos>>[number];
}) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[2rem] border border-[#f6dbe6] bg-white shadow-[0_20px_60px_rgba(190,24,93,0.12)] transition duration-300 hover:-translate-y-1">
      <div className="relative aspect-[4/3] overflow-hidden bg-[linear-gradient(135deg,#fff5f7,#ffe4ec_45%,#fff3d6)]">
        <Image
          src={produto.imagemBase64}
          alt={produto.nome}
          fill
          unoptimized
          className="object-cover transition duration-500 group-hover:scale-105"
        />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
          <div className="flex flex-col gap-2">
            {produto.emPromocao && (
              <span className="rounded-full bg-[#ff4d8d] px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-white shadow-lg">
                Promoção
              </span>
            )}
            <span className="w-fit rounded-full bg-white/88 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#a11756] backdrop-blur">
              {produto.categoria === "CENTO" ? "Cento" : "Lanchonete"}
            </span>
          </div>

          <div className="rounded-[1.4rem] bg-[#2e0d1d]/88 px-4 py-2 text-right text-white shadow-xl backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/70">
              Preço
            </p>
            <p className="text-xl font-black">{formatCurrency(produto.preco)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-2">
          <h2 className="text-xl font-black tracking-tight text-[#31121f]">{produto.nome}</h2>
          <p className="text-sm leading-6 text-[#6f5560]">{produto.descricao}</p>
        </div>

        <div className="grid gap-2 rounded-[1.4rem] bg-[#fff7fb] p-4 text-sm text-[#6f5560]">
          <span>{produto.totalUnidades} unidades</span>
          <span>Até {produto.maxTiposSalgado} tipos diferentes</span>
          <span>
            {produto.permitePagamentoParcial ? "Pagamento de 50% ou 100%" : "Pagamento integral"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-[#f9d4e3] bg-[#fff6fa] text-[#b31b61]">
            {produto.emPromocao ? "Em destaque" : "Disponível"}
          </Badge>
          {produto.emPromocao && (
            <div className="flex items-center gap-1 text-sm font-bold text-[#ff7a59]">
              <Flame className="h-4 w-4" />
              Promoção
            </div>
          )}
        </div>

        <Link
          href={`/pedido/${produto.slug}`}
          className="mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#ff4d8d] px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:bg-[#e43b7b]"
        >
          Montar pedido
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export default async function CardapioPage() {
  const produtos = await getProdutos();
  const destaque = produtos[0] || null;

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2.3rem] bg-[#170a11] text-white shadow-[0_30px_100px_rgba(23,10,17,0.32)]">
          <div className="relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#ff4d8d40_0,transparent_30%),radial-gradient(circle_at_bottom_right,#ffb34726_0,transparent_30%),linear-gradient(135deg,#170a11_0%,#2b1020_45%,#12080e_100%)]" />

            <div className="relative grid gap-8 px-6 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-10">
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 overflow-hidden rounded-full border-4 border-white/15 bg-white shadow-xl">
                    <Image
                      src="/vizinha-logo.png"
                      alt="Logo Vizinha Salgateria"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.24em] text-[#ff9fc1]">
                      Vizinha Salgateria
                    </p>
                    <p className="text-sm text-white/70">Pedidos online</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Badge className="w-fit border-white/10 bg-[#ff4d8d] text-white">
                    Encomendas online
                  </Badge>

                  <h1 className="max-w-2xl text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-5xl lg:text-6xl">
                    Monte sua encomenda com praticidade
                  </h1>

                  <p className="max-w-2xl text-sm leading-7 text-white/72 sm:text-base">
                    Escolha o produto, defina os tipos de salgado, agende o horário e
                    finalize seu pedido sem sair do site.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
                    <BadgePercent className="h-5 w-5 text-[#ff9fc1]" />
                    <p className="mt-3 text-sm font-black uppercase tracking-[0.18em]">
                      50% ou 100%
                    </p>
                    <p className="mt-2 text-sm text-white/68">
                      Dependendo do produto, você pode reservar com metade ou quitar tudo.
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
                    <Clock3 className="h-5 w-5 text-[#ff9fc1]" />
                    <p className="mt-3 text-sm font-black uppercase tracking-[0.18em]">
                      Horários
                    </p>
                    <p className="mt-2 text-sm text-white/68">
                      Entregas agendadas entre 09h e 17h, com mínimo de 2 horas de antecedência.
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
                    <Star className="h-5 w-5 text-[#ff9fc1]" />
                    <p className="mt-3 text-sm font-black uppercase tracking-[0.18em]">
                      Pedido do seu jeito
                    </p>
                    <p className="mt-2 text-sm text-white/68">
                      Monte as quantidades por tipo de salgado conforme as regras de cada produto.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                {destaque ? (
                  <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/6 p-3 backdrop-blur">
                    <ProductCard produto={destaque} />
                  </div>
                ) : (
                  <Card className="border-white/10 bg-white/8 text-white shadow-none">
                    <CardContent className="p-8">
                      <p className="text-lg font-bold">Estamos montando o cardápio.</p>
                      <p className="mt-2 text-sm text-white/68">
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
          <section className="rounded-[2rem] border border-[#f4d8e4] bg-white/90 p-10 text-center shadow-[0_18px_60px_rgba(190,24,93,0.1)]">
            <p className="text-lg font-bold text-[#9a1f55]">O cardápio ainda está sendo montado.</p>
            <p className="mt-2 text-sm text-[#6f5560]">
              Em breve, novos produtos aparecerão aqui.
            </p>
          </section>
        ) : (
          <section className="space-y-5">
            <div className="flex flex-col gap-3 rounded-[2rem] bg-[#1f0e17] px-6 py-6 text-white shadow-[0_24px_80px_rgba(31,14,23,0.28)]">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#ff9fc1]">
                Cardápio
              </p>
              <div>
                <h2 className="text-3xl font-black tracking-tight">Produtos para encomenda</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/72">
                  Cada produto já traz suas regras de quantidade, tipos permitidos e forma
                  de pagamento.
                </p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {produtos.map((produto) => (
                <ProductCard key={produto.id} produto={produto} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
