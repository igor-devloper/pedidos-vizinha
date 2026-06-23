import Link from "next/link";
import { CheckCircle2, Clock3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { syncCartOrderPaymentByExternalReference } from "@/lib/cart-order-payment";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/pedidos";

export const dynamic = "force-dynamic";

export default async function PedidoConfirmacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  if (ref) {
    await syncCartOrderPaymentByExternalReference(ref).catch((error) => {
      console.error("Sync cart order payment on confirmation page failed", error);
    });
  }

  const order = ref
    ? await prisma.order.findUnique({
        where: { externalReference: ref },
        include: { items: true },
      })
    : null;
  const isPaid = order?.status === "PAID";

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <Card className="border-[#d6e7a2] bg-white/95 shadow-lg shadow-green-100/40">
          <CardContent className="space-y-6 p-6 text-center sm:p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              {isPaid ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              ) : (
                <Clock3 className="h-8 w-8 text-amber-600" />
              )}
            </div>

            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">
                {isPaid ? "Pedido confirmado" : "Pedido em processamento"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                {isPaid
                  ? "Seu pagamento foi aprovado e o carrinho foi limpo."
                  : "Recebemos o retorno do pagamento. Sempre que esta pagina for aberta, conferimos novamente no Mercado Pago."}
              </p>
            </div>

            {order ? (
              <div className="rounded-[1.4rem] border border-[#d6e7a2] bg-[#fbfff0] p-5 text-left">
                <p className="text-xs font-black uppercase tracking-wide text-[#618038]">
                  Resumo
                </p>
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  {order.items.map((item) => (
                    <div key={item.id} className="space-y-2 border-b border-[#d6e7a2] pb-3 last:border-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-900">{item.productName}</p>
                          <p className="text-slate-500">
                            {item.productType} - {item.quantity} x {formatCurrency(Number(item.unitPrice))}
                          </p>
                        </div>
                        <p className="font-semibold text-[#0b3d18]">
                          {formatCurrency(Number(item.subtotal))}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-[#d6e7a2] pt-3">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>Total do pedido</span>
                      <span>{formatCurrency(Number(order.totalAmount))}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                      <span>Pagamento</span>
                      <span>
                        {order.paymentMethodLabel} - {order.paymentPercentage}% agora
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                      <span>Taxa</span>
                      <span>{formatCurrency(Number(order.feeAmount))}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-base font-black text-[#0b3d18]">
                      <span>Cobrado agora</span>
                      <span>{formatCurrency(Number(order.chargedAmount))}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                Nao localizamos o resumo deste pedido ainda.
              </div>
            )}

            <Button asChild className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]">
              <Link href="/cardapio">Voltar ao cardapio</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
