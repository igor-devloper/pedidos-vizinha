import { CartTransparentPayment } from "@/components/cart-transparent-payment";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function BalanceCheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !order.saldoExternalReference || !order.saldoTotalCobrado || order.saldoPagoAt) {
    return <main className="min-h-screen bg-[#f7fde7] px-4 py-16"><div className="mx-auto max-w-lg rounded-2xl bg-white p-8 text-center shadow"><h1 className="text-xl font-bold">Saldo indisponível</h1><p className="mt-3 text-slate-600">Este link não é válido, já foi pago ou ainda não está disponível.</p></div></main>;
  }

  return <main className="min-h-screen bg-[#f7fde7] px-4 py-10"><div className="mx-auto max-w-2xl"><p className="mb-4 text-center text-sm font-bold text-[#52705a]">Vizinha Salgateria • Saldo do pedido {order.code}</p><CartTransparentPayment session={{ orderId: order.id, externalReference: order.saldoExternalReference, paymentMethod: order.paymentMethod, chargedAmount: Number(order.saldoTotalCobrado), balance: true }} customerEmail={order.customerEmail || ""} /></div></main>;
}
