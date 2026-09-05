import { NextResponse } from "next/server";
import { MetodoPagamento, OrderSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createCartMercadoPagoPixPayment, MercadoPagoApiError, getMercadoPagoErrorMessage } from "@/lib/mercado-pago";
import { createValidatedOrder, previewValidatedOrder, type NormalizedOrderInput } from "@/lib/order-creation-service";
import { recordOrderEvent } from "@/lib/order-audit";
import { getInternalOrderKeys, normalizeApiKey } from "@/services/whatsapp-bot/src/internal-order-client";

function hasValidInternalAuthorization(request: Request) {
  const supplied = normalizeApiKey(request.headers.get("authorization") || "");
  const accepted = getInternalOrderKeys(process.env);
  return supplied.length > 0 && accepted.includes(supplied);
}

export async function POST(request: Request) {
  if (!hasValidInternalAuthorization(request)) {
    console.error("WhatsApp order authentication failed: check shared API keys on site and bot.");
    return NextResponse.json({ error: "Integração de pedidos indisponível.", code: "INTERNAL_ORDER_UNAUTHORIZED" }, { status: 401 });
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
    const input: NormalizedOrderInput = {
      customerName: String(draft.customerName || ""), customerPhone: draft.phone,
      customerEmail: String(draft.customerEmail || ""), scheduledAt,
      fulfillmentType: ["DELIVERY", "ENTREGA"].includes(String(draft.fulfillmentType).toUpperCase()) ? "DELIVERY" : "PICKUP",
      deliveryAddress: draft.deliveryStreet || undefined, deliveryNumber: draft.deliveryNumber || undefined,
      deliveryNeighborhood: draft.deliveryNeighborhood || undefined, deliveryReference: draft.deliveryReference || undefined,
      paymentMethod: Object.values(MetodoPagamento).includes(draft.paymentMethod as MetodoPagamento) ? draft.paymentMethod as MetodoPagamento : MetodoPagamento.PIX,
      paymentPercentage: draft.paymentPercentage === 50 ? 50 : 100,
      source: OrderSource.WHATSAPP, idempotencyKey: draft.id, items: draft.items as Parameters<typeof createValidatedOrder>[0]["items"],
    };
    if (body.preview === true) {
      const quote = await previewValidatedOrder(input);
      const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const summary = [
        `*Resumo do pedido de ${quote.name}*`,
        ...quote.normalizedItems.map(({ product, quantities, subtotal }) => `${quantities.usesMinimumQuantity ? quantities.requestedUnits + " unidades" : quantities.quantity + " ×"} de ${product.nome}: ${money(subtotal)}${quantities.selectedItems.length ? "\n" + quantities.selectedItems.map((item) => `  ${item.quantidade} ${item.tipo}`).join("\n") : ""}`),
        `${input.fulfillmentType === "DELIVERY" ? "Entrega" : "Retirada"}: ${scheduledAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`,
        ...(input.fulfillmentType === "DELIVERY" ? [`Endereço: ${draft.deliveryStreet}, ${draft.deliveryNumber}, ${draft.deliveryNeighborhood}. Referência: ${draft.deliveryReference || "Sem referência"}`, `Entrega: ${quote.delivery.agreed ? money(quote.delivery.fee) : "taxa a combinar"}`] : []),
        `Contato: ${quote.phone} • ${quote.email}`,
        `Total dos produtos e entrega: ${money(quote.total)}`,
        `${quote.payment.methodLabel} • ${input.paymentPercentage}% agora`,
        `Taxa do pagamento: ${money(quote.payment.feeAmount)}`,
        `Valor a pagar agora: ${money(quote.payment.totalToCharge)}`,
        "Está tudo certo? Pode confirmar que eu gero o pagamento.",
      ].join("\n\n");
      return NextResponse.json({ summary });
    }
    const order = await createValidatedOrder(input);
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
    if (error instanceof MercadoPagoApiError) {
      console.error("WhatsApp Mercado Pago payment failed", { status: error.status });
      return NextResponse.json({ error: getMercadoPagoErrorMessage(error), code: "PAYMENT_PROVIDER_ERROR" }, { status: 502 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar pedido." }, { status: 400 });
  }
}
