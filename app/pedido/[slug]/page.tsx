import { notFound } from "next/navigation";
import { MetodoPagamento } from "@prisma/client";

import { PedidoCheckout } from "@/components/pedido-checkout";
import { getFullStoreStatus } from "@/lib/business-hours";
import { prisma } from "@/lib/db";
import { listMercadoPagoMethods } from "@/lib/mercado-pago";
import { getProdutoComboItens } from "@/lib/produtos";
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
  });

  if (!produto || !produto.ativo) {
    notFound();
  }

  const [paymentMethods, businessStatus] = await Promise.all([
    listMercadoPagoMethods(),
    getFullStoreStatus(),
  ]);

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-[2rem] border border-pink-200 bg-white/95 p-6 shadow-xl shadow-pink-100/30">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-600">
            Configuração do pedido
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">
            Finalize sua encomenda
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
            Defina os tipos de salgado, a data de entrega, escolha 50% ou 100% e
            conclua tudo por aqui com praticidade.
          </p>
        </section>

        <PedidoCheckout
          produto={{
            id: produto.id,
            slug: produto.slug,
            nome: produto.nome,
            descricao: produto.descricao,
            preco: Number(produto.preco),
            imagemBase64: produto.imagemBase64,
            totalUnidades: produto.totalUnidades,
            maxTiposSalgado: produto.maxTiposSalgado,
            permitePagamentoParcial: produto.permitePagamentoParcial,
            emPromocao: produto.emPromocao,
            descontoPercentual: Number(produto.descontoPercentual),
            categoria: produto.categoria as "CENTO" | "LANCHONETE" | "COMBO",
            saboresSugeridos: normalizeSaboresList(produto.saboresSugeridos),
            comboItens: getProdutoComboItens(produto as { comboItens?: unknown }),
          }}
          paymentMethods={
            paymentMethods.length > 0
              ? paymentMethods
              : [
                  {
                    id: MetodoPagamento.PIX,
                    label: "Pix",
                    description: "Pagamento instantâneo",
                    feePercent: 0,
                  },
                ]
          }
          businessStatus={{
            isOpen: businessStatus.isOpen,
            message: businessStatus.message,
            minimumLeadHours: businessStatus.minimumLeadHours,
          }}
          siteTheme={businessStatus.siteTheme}
        />
      </div>
    </main>
  );
}
