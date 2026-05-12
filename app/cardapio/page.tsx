import Image from "next/image";
import type { Metadata } from "next";
import { Clock3, MapPin, MessageCircleMore, Sparkles } from "lucide-react";

import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Cardapio | Vizinha Salgateria",
  description: "Conheca o cardapio da Vizinha Salgateria.",
};

async function getProdutos() {
  try {
    const produtos = await prisma.produto.findMany({
      where: { ativo: true },
      orderBy: [{ createdAt: "desc" }],
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

export default async function CardapioPage() {
  const produtos = await getProdutos();

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-pink-200/80 bg-white/90 shadow-xl shadow-pink-100/60">
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.3fr_0.7fr] lg:px-10 lg:py-10">
            <div className="space-y-5">
              <Badge className="border border-pink-200 bg-pink-100 text-pink-700">
                Cardapio da Vizinha
              </Badge>

              <div className="space-y-3">
                <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-pink-800 sm:text-4xl">
                  Salgados com jeitinho caseiro e a cara da Vizinha.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  Veja os produtos da casa e fale direto no WhatsApp para combinar
                  disponibilidade, quantidades e entrega.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  className="rounded-full bg-pink-600 px-6 text-white hover:bg-pink-700"
                >
                  <a
                    href="https://wa.me/5583987137721"
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
                    <p>Produtos com foto, descricao e valor visiveis no cardapio.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-4 w-4 text-pink-500" />
                    <p>Consulte antecedencia e disponibilidade para producao.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 text-pink-500" />
                    <p>Atendimento local com contato direto pelo WhatsApp.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="itens" className="space-y-5">
          {produtos.length === 0 ? (
            <div className="rounded-[2rem] border border-pink-200/70 bg-white/90 p-8 text-center shadow-lg shadow-pink-100/40">
              <p className="text-lg font-semibold text-pink-800">
                O cardapio ainda esta sendo montado.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Em breve novos produtos aparecerao aqui.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {produtos.map((produto) => (
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
                      <h2 className="text-lg font-semibold text-slate-900">
                        {produto.nome}
                      </h2>
                      <Badge className="shrink-0 rounded-full border border-pink-200 bg-white text-pink-700">
                        {Number(produto.preco).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </Badge>
                    </div>
                    <p className="text-sm leading-6 text-slate-500">
                      {produto.descricao}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
