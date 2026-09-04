import { NextResponse } from "next/server";
import { MetodoPagamento, OrderSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createCartMercadoPagoPixPayment } from "@/lib/mercado-pago";
import { createValidatedOrder } from "@/lib/order-creation-service";
import { recordOrderEvent } from "@/lib/order-audit";

function hasValidInternalAuthorization(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const accepted = [process.env.INTERNAL_ORDER_API_KEY, process.env.BOT_SERVICE_API_KEY, process.env.BOT_API_KEY]
    .map((value) => value?.trim()).filter(Boolean);
  return supplied.length > 0 && accepted.includes(supplied);
}

export async function POST(request: Request) {
  if (!hasValidInternalAuthorization(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const draft = await prisma.whatsappOrderDraft.findUnique({ where: { id: String(body.draftId) } });
    if (!draft) return NextResponse.json({ error: "Draft não encontrado." }, { status: 404 });
    if (draft.orderId) {
      const order = await prisma.order.findUnique({ where: { id: draft.orderId }, include: { items: true } });
      if (!order) return NextResponse.json({ error: "Pedido vinculado não encontrado." }, { status: 404 });
      return NextResponse.json({
        order,
        repeated: true,
        pixCopyPaste: order.pixQrCode,
        checkoutUrl: order.paymentMethod === MetodoPagamento.PIX ? undefined : `${process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000"}/checkout/order/${order.id}`,
      });
    }
    const scheduledAt = new Date(String(draft.scheduledAt));
    if (Number.isNaN(scheduledAt.getTime())) throw new Error("Data e horário inválidos.");
    const order = await createValidatedOrder({
      customerName: String(draft.customerName || ""), customerPhone: draft.phone,
      customerEmail: String(draft.customerEmail || ""), scheduledAt,
      fulfillmentType: ["DELIVERY", "ENTREGA"].includes(String(draft.fulfillmentType).toUpperCase()) ? "DELIVERY" : "PICKUP",
      deliveryAddress: draft.deliveryStreet || undefined, deliveryNumber: draft.deliveryNumber || undefined,
      deliveryNeighborhood: draft.deliveryNeighborhood || undefined, deliveryReference: draft.deliveryReference || undefined,
      paymentMethod: Object.values(MetodoPagamento).includes(draft.paymentMethod as MetodoPagamento) ? draft.paymentMethod as MetodoPagamento : MetodoPagamento.PIX,
      paymentPercentage: draft.paymentPercentage === 50 ? 50 : 100,
      source: OrderSource.WHATSAPP, idempotencyKey: draft.id, items: draft.items as Parameters<typeof createValidatedOrder>[0]["items"],
    });
    if (order.paymentMethod === MetodoPagamento.PIX) {
      const payment = await createCartMercadoPagoPixPayment({
        order,
        payer: { email: order.customerEmail, name: order.customerName, phone: order.customerPhone },
        chargedAmount: Number(order.chargedAmount),
      });
      await prisma.order.update({
        where: { id: order.id },
        data: {
          mercadoPagoPaymentId: String(payment.id), mercadoPagoStatusDetail: payment.statusDetail,
          pixQrCode: payment.qrCode, pixQrCodeBase64: payment.qrCodeBase64,
          pixExpirationDate: payment.expirationDate ? new Date(payment.expirationDate) : null,
        },
      });
      await prisma.whatsappOrderDraft.update({ where: { id: draft.id }, data: { orderId: order.id, status: "AWAITING_PAYMENT", stage: "ORDER_CREATED", whatsappOfferDueAt: null } });
      await recordOrderEvent({ orderId: order.id, event: "PAYMENT_CREATED", source: "WHATSAPP", newStatus: order.status, metadata: { paymentId: String(payment.id), method: "PIX" } });
      return NextResponse.json({ order, pixCopyPaste: payment.qrCode, paymentStatus: payment.status });
    }
    await prisma.whatsappOrderDraft.update({ where: { id: draft.id }, data: { orderId: order.id, status: "AWAITING_PAYMENT", stage: "ORDER_CREATED", whatsappOfferDueAt: null } });
    return NextResponse.json({ order, checkoutUrl: `${process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000"}/checkout/order/${order.id}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar pedido." }, { status: 400 });
  }
}
