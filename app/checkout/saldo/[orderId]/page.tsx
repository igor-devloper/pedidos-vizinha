import { notFound } from "next/navigation";

import { CartTransparentPayment } from "@/components/cart-transparent-payment";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function BalanceCheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !order.saldoExternalReference || !order.saldoTotalCobrado || order.saldoPagoAt) notFound();

  return <main className="min-h-screen bg-[#f7fde7] px-4 py-10"><div className="mx-auto max-w-2xl"><p className="mb-4 text-center text-sm font-bold text-[#52705a]">Vizinha Salgateria • Saldo do pedido {order.code}</p><CartTransparentPayment session={{ orderId: order.id, externalReference: order.saldoExternalReference, paymentMethod: order.paymentMethod, chargedAmount: Number(order.saldoTotalCobrado), balance: true }} customerEmail={order.customerEmail || ""} /></div></main>;
}
