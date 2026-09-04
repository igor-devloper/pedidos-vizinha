import { CartTransparentPayment } from "@/components/cart-transparent-payment";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function Unavailable({ message }: { message: string }) {
  return <main className="min-h-screen bg-[#f7fde7] px-4 py-16"><div className="mx-auto max-w-lg rounded-2xl bg-white p-8 text-center shadow"><h1 className="text-xl font-bold">Pagamento indisponível</h1><p className="mt-3 text-slate-600">{message}</p></div></main>;
}

export default async function OrderCheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return <Unavailable message="Não encontramos este pedido. Confira o link recebido ou fale com a Vizinha." />;
  if (order.status === "PAID") return <Unavailable message="Este pedido já está pago." />;
  if (order.status === "CANCELLED") return <Unavailable message="Este pedido foi cancelado e não aceita novos pagamentos." />;
  return <main className="min-h-screen bg-[#f7fde7] px-4 py-10"><div className="mx-auto max-w-2xl"><p className="mb-4 text-center text-sm font-bold text-[#52705a]">Vizinha Salgateria • Pedido {order.code}</p><CartTransparentPayment session={{ orderId: order.id, externalReference: order.externalReference, paymentMethod: order.paymentMethod, chargedAmount: Number(order.chargedAmount) }} customerEmail={order.customerEmail || ""} /></div></main>;
}
