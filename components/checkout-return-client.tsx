"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDateTime, getPedidoStatusMeta } from "@/lib/pedidos";

type PedidoResponse = {
  id: string;
  codigo: string;
  clienteNome: string;
  dataEntrega: string;
  totalCobrado: string | number;
  status: "PENDENTE_PAGAMENTO" | "PAGO" | "EM_PREPARO" | "PRONTO" | "ENTREGUE" | "CANCELADO";
  produtoNomeSnapshot: string;
};

export function CheckoutReturnClient({
  externalReference,
}: {
  externalReference: string;
}) {
  const [pedido, setPedido] = useState<PedidoResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(externalReference));
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!externalReference) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const load = async (silent = false) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        await fetch(`/api/pedidos/${externalReference}/sync`, {
          method: "POST",
          cache: "no-store",
        }).catch(() => null);

        const response = await fetch(`/api/pedidos/${externalReference}`, {
          cache: "no-store",
        });

        if (!response.ok || cancelled) {
          return;
        }

        const data = (await response.json()) as PedidoResponse;
        setPedido(data);

        if (["PAGO", "EM_PREPARO", "PRONTO", "ENTREGUE", "CANCELADO"].includes(data.status) && intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void load();

    intervalId = setInterval(() => {
      void load(true);
    }, 4000);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [externalReference]);

  const isConfirmed =
    pedido?.status === "PAGO" ||
    pedido?.status === "EM_PREPARO" ||
    pedido?.status === "PRONTO" ||
    pedido?.status === "ENTREGUE";

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
              {isConfirmed ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              ) : (
                <Clock3 className="h-8 w-8 text-emerald-600" />
              )}
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">
                {isConfirmed ? "Pedido confirmado" : "Pedido em processamento"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                {isConfirmed
                  ? "Seu pagamento já foi validado. A confirmação do pedido também segue para o WhatsApp."
                  : "Estamos acompanhando a validação do pagamento. Assim que a confirmação cair, esta tela atualiza sozinha."}
              </p>
              {!isConfirmed && refreshing ? (
                <p className="mt-2 text-xs font-medium text-pink-600">
                  Atualizando status automaticamente...
                </p>
              ) : null}
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
                  <p>Status atual: {getPedidoStatusMeta(pedido.status as "PRONTO").label}</p>
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
                <Link href="/">Inicio</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
