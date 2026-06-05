"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDateTime, getPedidoStatusMeta } from "@/lib/pedidos";

type PedidoResponse = {
  id: string;
  codigo: string;
  clienteNome: string;
  dataEntrega: string;
  totalCobrado: string | number;
  status: "PENDENTE_PAGAMENTO" | "PAGO" | "EM_PREPARO" | "ENTREGUE" | "CANCELADO";
  produtoNomeSnapshot: string;
};

export function CheckoutReturnClient({
  externalReference,
}: {
  externalReference: string;
}) {
  const [pedido, setPedido] = useState<PedidoResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(externalReference));

  useEffect(() => {
    if (!externalReference) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const response = await fetch(`/api/pedidos/${externalReference}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as PedidoResponse;
        setPedido(data);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [externalReference]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="border-pink-200 bg-white/95 px-8 py-6 shadow-md">
          <CardContent className="flex items-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin text-pink-600" />
            <p className="text-sm text-slate-700">Conferindo o retorno do pagamento...</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/30">
          <CardContent className="space-y-5 p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">
                Pedido em processamento
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Seu pedido voltou para a etapa final de confirmação. Em instantes, o
                pagamento é validado e você recebe a confirmação no WhatsApp.
              </p>
            </div>

            {pedido ? (
              <div className="rounded-[1.6rem] bg-[#fff7fb] p-5 text-left">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-600">
                  Resumo do pedido
                </p>
                <div className="mt-4 space-y-2 text-sm text-slate-700">
                  <p>Pedido: {pedido.codigo}</p>
                  <p>Cliente: {pedido.clienteNome}</p>
                  <p>Produto: {pedido.produtoNomeSnapshot}</p>
                  <p>Entrega: {formatDateTime(pedido.dataEntrega)}</p>
                  <p>Total cobrado: {formatCurrency(Number(pedido.totalCobrado))}</p>
                  <p>Status atual: {getPedidoStatusMeta(pedido.status).label}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.6rem] bg-[#fff7fb] p-5 text-sm text-slate-600">
                O retorno foi recebido, mas ainda estamos aguardando localizar os dados do
                pedido. Se necessário, volte em instantes.
              </div>
            )}

            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild className="rounded-full bg-pink-600 text-white hover:bg-pink-700">
                <Link href="/cardapio">Voltar ao cardápio</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
              >
                <Link href="/">Início</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
