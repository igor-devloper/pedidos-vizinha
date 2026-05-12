// app/pagamento/[txid]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PixPayment } from "@/components/pix-payment";
import { generatePixQRCode } from "@/lib/pix";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const UNIT_PRICE = 0.9;

type EncomendaItem = {
  id: string;
  tipo: string;
  quantidade: number;
};

type Encomenda = {
  id: string;
  txid: string;
  nome: string;
  telefone: string;
  email: string;
  observacoes: string | null;
  status: string;
  createdAt: string;
  itens: EncomendaItem[];
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro ao carregar pedido.";
}

export default function PagamentoPage() {
  const params = useParams<{ txid: string }>();
  const txid = params.txid;

  const [encomenda, setEncomenda] = useState<Encomenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<"TOTAL" | "METADE">("TOTAL");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/encomendas/${txid}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("Não foi possível carregar o pedido.");
        }
        const data = (await res.json()) as Encomenda;
        setEncomenda(data);
      } catch (error: unknown) {
        setError(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    };
    if (txid) load();
  }, [txid]);

  const valorTotalBase = useMemo(() => {
    if (!encomenda) return 0;
    const qtdTotal = (encomenda.itens || []).reduce(
      (acc, i) => acc + i.quantidade,
      0
    );
    return qtdTotal * UNIT_PRICE;
  }, [encomenda]);

  const amount = useMemo(
    () =>
      payMode === "TOTAL" ? valorTotalBase : Number((valorTotalBase / 2).toFixed(2)),
    [valorTotalBase, payMode]
  );

  const pixPayload = useMemo(
    () =>
      amount > 0
        ? generatePixQRCode({
            amount,
          })
        : "",
    [amount]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white flex items-center justify-center px-4">
        <Card className="border-pink-200 bg-white/95 px-8 py-6 shadow-md">
          <CardContent className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-pink-600" />
            <p className="text-sm text-slate-700">
              Carregando informações do pagamento…
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (error || !encomenda) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white flex items-center justify-center px-4">
        <Card className="border-red-200 bg-white/95 px-8 py-6 shadow-md">
          <CardContent>
            <p className="text-sm text-red-600">
              {error || "Pedido não encontrado."}
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 via-pink-50 to-white px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-pink-700">
            Finalize o pagamento da sua encomenda
          </h1>
          <p className="text-sm text-pink-500">
            Pedido em nome de{" "}
            <span className="font-semibold">{encomenda.nome}</span>.
          </p>
          <p className="text-xs mt-1 text-slate-600">
            Valor total da encomenda:{" "}
            <span className="font-semibold">
              R$ {valorTotalBase.toFixed(2)}
            </span>
          </p>
        </div>

        {/* Escolha: pagar metade ou total */}
        <Card className="border-pink-200 bg-white/95 shadow-sm">
          <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm font-medium text-slate-700">
              Como você deseja pagar agora?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={payMode === "METADE" ? "default" : "outline"}
                className={
                  payMode === "METADE"
                    ? "bg-pink-600 text-white hover:bg-pink-700"
                    : "border-pink-200 text-pink-700 hover:bg-pink-50"
                }
                onClick={() => setPayMode("METADE")}
              >
                Pagar metade agora (R$ {(valorTotalBase / 2).toFixed(2)})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={payMode === "TOTAL" ? "default" : "outline"}
                className={
                  payMode === "TOTAL"
                    ? "bg-pink-600 text-white hover:bg-pink-700"
                    : "border-pink-200 text-pink-700 hover:bg-pink-50"
                }
                onClick={() => setPayMode("TOTAL")}
              >
                Pagar total agora (R$ {valorTotalBase.toFixed(2)})
              </Button>
            </div>
          </CardContent>
        </Card>

        <PixPayment
          amount={amount}
          orderId={encomenda.txid}
          pixPayload={pixPayload}
        />
      </div>
    </main>
  );
}
