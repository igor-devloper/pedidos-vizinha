import Image from "next/image";
import type { Metadata } from "next";
import { Clock3, MapPin, MessageCircleMore, Sparkles } from "lucide-react";

import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

type ProdutoWithPromocao = Awaited<
  ReturnType<typeof prisma.produto.findMany>
>[number] & {
  emPromocao?: boolean;
};

export const metadata: Metadata = {
  title: "Cardápio | Vizinha Salgateria",
  description: "Conheça o cardápio da Vizinha Salgateria.",
};

async function getProdutos() {
  try {
    const produtos = (await prisma.produto.findMany({
      where: { ativo: true },
      orderBy: [{ categoria: "asc" }, { createdAt: "desc" }],
    })) as ProdutoWithPromocao[];

    return produtos
      .map((produto) => ({
        ...produto,
        preco: Number(produto.preco),
        emPromocao: Boolean(produto.emPromocao),
      }))
      .sort((a, b) => Number(b.emPromocao) - Number(a.emPromocao));
  } catch (error) {
    console.error("GET produtos cardapio page error", error);
    return [];
  }
}

function ProductGrid({
  items,
}: {
  items: Awaited<ReturnType<typeof getProdutos>>;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((produto) => (
        <article
          key={produto.id}
          className="overflow-hidden rounded-[2rem] border border-pink-200/70 bg-white/95 shadow-lg shadow-pink-100/40"
        >
          <div className="relative aspect-[4/3] bg-pink-50">
            <Image
              src={produto.imagemBase64}
              alt={produto.nome}
              fill
              unoptimized
              className="object-cover"
            />
          </div>

          <div className="space-y-3 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-900">{produto.nome}</h2>
                {produto.emPromocao && (
                  <Badge className="rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                    Promoção
                  </Badge>
                )}
              </div>
              <Badge
                className={
                  produto.emPromocao
                    ? "shrink-0 rounded-full border border-amber-200 bg-amber-100 text-amber-800"
                    : "shrink-0 rounded-full border border-pink-200 bg-white text-pink-700"
                }
              >
                {Number(produto.preco).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </Badge>
            </div>
            <p className="text-sm leading-6 text-slate-500">{produto.descricao}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function ProductSection({
  title,
  description,
  emptyMessage,
  items,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  items: Awaited<ReturnType<typeof getProdutos>>;
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-[2rem] border border-pink-200/70 bg-white/90 p-6 shadow-lg shadow-pink-100/40">
        <h2 className="text-2xl font-semibold text-pink-800">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[2rem] border border-pink-200/70 bg-white/90 p-8 text-center shadow-lg shadow-pink-100/40">
          <p className="text-lg font-semibold text-pink-800">{emptyMessage}</p>
        </div>
      ) : (
        <ProductGrid items={items} />
      )}
    </section>
  );
}

export default async function CardapioPage() {
  const produtos = await getProdutos();
  const produtosCento = produtos.filter((produto) => produto.categoria === "CENTO");
  const produtosLanchonete = produtos.filter(
    (produto) => produto.categoria === "LANCHONETE"
  );

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-pink-200/80 bg-white/90 shadow-xl shadow-pink-100/60">
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.3fr_0.7fr] lg:px-10 lg:py-10">
            <div className="space-y-5">
              <Badge className="border border-pink-200 bg-pink-100 text-pink-700">
                Cardápio da Vizinha
              </Badge>

              <div className="space-y-3">
                <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-pink-800 sm:text-4xl">
                  Salgados com jeitinho caseiro e a cara da Vizinha.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  Veja os produtos da casa, escolha entre o cardápio de cento e o da
                  lanchonete e fale direto no WhatsApp para combinar disponibilidade,
                  horário da entrega e pagamento.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  className="rounded-full bg-pink-600 px-6 text-white hover:bg-pink-700"
                >
                  <a
                    href="https://wa.me/5583993760485"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircleMore className="mr-2 h-4 w-4" />
                    Falar no WhatsApp
                  </a>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50 hover:text-pink-800"
                >
                  <a href="#itens">Ver menu</a>
                </Button>
              </div>
            </div>

            <Card className="border-pink-200 bg-gradient-to-br from-pink-50 via-white to-pink-100 shadow-none">
              <CardContent className="space-y-5 p-6">
                <div className="flex items-center gap-3">
                  <div className="relative h-16 w-16 overflow-hidden rounded-full border-4 border-pink-200 bg-white shadow-md shadow-pink-100">
                    <Image
                      src="/vizinha-logo.png"
                      alt="Logo Vizinha Salgateria"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-pink-800">
                      Vizinha Salgateria
                    </p>
                    <p className="text-sm text-slate-500">
                      Sabor, carinho e praticidade.
                    </p>
                  </div>
                </div>

                <Separator className="bg-pink-100" />

                <div className="space-y-4 text-sm text-slate-600">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 text-pink-500" />
                    <p>Produtos com foto, descrição e valor visíveis no cardápio.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-4 w-4 text-pink-500" />
                    <p>O horário da entrega é informado pelo cliente no atendimento.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 text-pink-500" />
                    <p>
                      Encomendas confirmadas com aceite da Vizinha e pagamento total
                      ou metade.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="itens" className="space-y-8">
          {produtos.length === 0 ? (
            <div className="rounded-[2rem] border border-pink-200/70 bg-white/90 p-8 text-center shadow-lg shadow-pink-100/40">
              <p className="text-lg font-semibold text-pink-800">
                O cardápio ainda está sendo montado.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Em breve, novos produtos aparecerão aqui.
              </p>
            </div>
          ) : (
            <>
              <ProductSection
                title="Cardápio de cento"
                description="Ideal para encomendas maiores, festas e eventos."
                items={produtosCento}
                emptyMessage="Nenhum item de cento foi publicado ainda."
              />
              <ProductSection
                title="Cardápio da lanchonete"
                description="Opções separadas para o atendimento da lanchonete, sem misturar com os produtos de cento."
                items={produtosLanchonete}
                emptyMessage="Nenhum item da lanchonete foi publicado ainda."
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
