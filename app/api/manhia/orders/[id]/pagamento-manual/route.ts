import { NextResponse } from "next/server";
import { z } from "zod";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

const manualPaymentSchema = z.object({
  valorPago: z.coerce.number().positive().optional(),
  observacao: z.string().trim().max(300).optional().or(z.literal("")),
});

function serializeOrder(order: Awaited<ReturnType<typeof loadOrder>>) {
  if (!order) {
    return null;
  }

  return {
    id: order.id,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    totalAmount: Number(order.totalAmount),
    paymentPercentage: order.paymentPercentage,
    paymentMethodLabel: order.paymentMethodLabel,
    chargedAmount: Number(order.chargedAmount),
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      productType: item.productType,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
    })),
  };
}

function loadOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const payload = manualPaymentSchema.parse(await req.json().catch(() => ({})));
    const order = await loadOrder(id);

    if (!order) {
      return NextResponse.json({ error: "Pedido do carrinho nao encontrado." }, { status: 404 });
    }

    if (order.status === "CANCELLED") {
      return NextResponse.json({ error: "Pedido cancelado nao pode ser confirmado." }, { status: 400 });
    }

    const manualPayload = {
      source: "manual-cash-payment",
      paidAt: new Date().toISOString(),
      amount: payload.valorPago ?? Number(order.chargedAmount || order.totalAmount),
      note: payload.observacao || "Pagamento em dinheiro confirmado",
    };

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        mercadoPagoPaymentId: `manual-cash-${order.id}`,
        // Keep the Mercado Pago fields intact; this marker only records the manual confirmation.
        mercadoPagoId: order.mercadoPagoId,
      },
      include: { items: true },
    });

    if (order.cartId) {
      await prisma.cartItem.deleteMany({
        where: { cartId: order.cartId },
      });
    }

    console.log("[Manhia] Pedido do carrinho confirmado manualmente:", {
      orderId: order.id,
      ...manualPayload,
    });

    return NextResponse.json(serializeOrder(updated));
  } catch (error) {
    console.error("PATCH /api/manhia/orders/[id]/pagamento-manual error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao confirmar pagamento manual." },
      { status: 400 }
    );
  }
}
