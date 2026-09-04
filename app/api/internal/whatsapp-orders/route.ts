import { NextResponse } from "next/server";
import { MetodoPagamento, OrderSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createCartMercadoPagoPixPayment } from "@/lib/mercado-pago";
import { createValidatedOrder } from "@/lib/order-creation-service";
import { recordOrderEvent } from "@/lib/order-audit";

export async function POST(request: Request) {
  if (!process.env.BOT_API_KEY || request.headers.get("authorization") !== `Bearer ${process.env.BOT_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const draft = await prisma.whatsappOrderDraft.findUnique({ where: { id: String(body.draftId) } });
    if (!draft) return NextResponse.json({ error: "Draft não encontrado." }, { status: 404 });
    if (draft.orderId) {
      const order = await prisma.order.findUnique({ where: { id: draft.orderId }, include: { items: true } });
      return NextResponse.json({ order, repeated: true });
    }
    const scheduledAt = new Date(String(body.scheduledAt));
    if (Number.isNaN(scheduledAt.getTime())) throw new Error("Data e horário inválidos.");
    const order = await createValidatedOrder({
      customerName: String(body.customerName || ""), customerPhone: draft.phone,
      customerEmail: String(body.customerEmail || ""), scheduledAt,
      fulfillmentType: body.fulfillmentType === "DELIVERY" ? "DELIVERY" : "PICKUP",
      deliveryAddress: body.deliveryStreet, deliveryNumber: body.deliveryNumber,
      deliveryNeighborhood: body.deliveryNeighborhood, deliveryReference: body.deliveryReference,
      paymentMethod: Object.values(MetodoPagamento).includes(body.paymentMethod) ? body.paymentMethod : MetodoPagamento.PIX,
      paymentPercentage: body.paymentPercentage === 50 ? 50 : 100,
      source: OrderSource.WHATSAPP, idempotencyKey: draft.id, items: body.items,
    });
    await prisma.whatsappOrderDraft.update({ where: { id: draft.id }, data: { orderId: order.id, status: "AWAITING_PAYMENT", stage: "ORDER_CREATED", whatsappOfferDueAt: null } });
    if (order.paymentMethod === MetodoPagamento.PIX) {
      const payment = await createCartMercadoPagoPixPayment({
        order,
        payer: { email: order.customerEmail, name: order.customerName, phone: order.customerPhone },
        chargedAmount: Number(order.chargedAmount),
      });
      await recordOrderEvent({ orderId: order.id, event: "PAYMENT_CREATED", source: "WHATSAPP", newStatus: order.status, metadata: { paymentId: String(payment.id), method: "PIX" } });
      return NextResponse.json({ order, pixCopyPaste: payment.qrCode, paymentStatus: payment.status });
    }
    return NextResponse.json({ order, checkoutUrl: `${process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000"}/checkout/order/${order.id}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar pedido." }, { status: 400 });
  }
}
