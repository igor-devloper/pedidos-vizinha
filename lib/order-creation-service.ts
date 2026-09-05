import { randomUUID } from "crypto";
import { MetodoPagamento, OrderSource, OrderStatus, PedidoStatus, Prisma } from "@prisma/client";
import { getFullStoreStatus, isSameBusinessDate } from "@/lib/business-hours";
import { validateCartItemQuantities } from "@/lib/cart-quantity";
import { prisma } from "@/lib/db";
import { getDeliveryFee } from "@/lib/delivery";
import { recordOrderEvent } from "@/lib/order-audit";
import { calculatePaymentAmounts, validateDeliveryDate } from "@/lib/pedidos";

export type NormalizedOrderInput = {
  customerName: string; customerPhone: string; customerEmail: string;
  scheduledAt: Date; fulfillmentType: "PICKUP" | "DELIVERY";
  deliveryAddress?: string; deliveryNumber?: string; deliveryNeighborhood?: string;
  deliveryReference?: string; paymentMethod: MetodoPagamento; paymentPercentage: 50 | 100;
  source: OrderSource; idempotencyKey?: string;
  items: Array<{ productId: string; quantity: number; requestedUnits?: number; selectedItems?: unknown }>;
};

export async function previewValidatedOrder(input: NormalizedOrderInput) {
  const name = input.customerName.trim();
  const phone = input.customerPhone.replace(/\D/g, "");
  const email = input.customerEmail.trim();
  if (name.length < 2 || phone.length < 10 || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Dados do cliente incompletos.");
  if (!input.items.length) throw new Error("O pedido precisa ter pelo menos um item.");

  const products = await prisma.produto.findMany({
    where: { id: { in: input.items.map((item) => item.productId) }, ativo: true }, include: { productType: true },
  });
  if (products.length !== new Set(input.items.map((item) => item.productId)).size) throw new Error("Produto inexistente ou indisponível.");
  const normalizedItems = input.items.map((item) => {
    const product = products.find((candidate) => candidate.id === item.productId)!;
    const quantities = validateCartItemQuantities({ product, audience: "VIZINHA", quantity: item.quantity, requestedUnits: item.requestedUnits, selectedItems: item.selectedItems });
    const basePrice = Number(product.preco);
    const discount = product.emPromocao ? Number(product.descontoPercentual) : 0;
    const unitPrice = Number((basePrice * (1 - discount / 100)).toFixed(2));
    const subtotal = quantities.usesMinimumQuantity
      ? Number((unitPrice * quantities.requestedUnits / product.totalUnidades).toFixed(2))
      : Number((unitPrice * quantities.quantity).toFixed(2));
    return { product, quantities, unitPrice, subtotal };
  });
  if (input.paymentPercentage === 50 && normalizedItems.some(({ product }) => !product.permitePagamentoParcial)) throw new Error("Um dos produtos exige pagamento integral.");
  const settings = await getFullStoreStatus();
  if (!settings.isOpen && isSameBusinessDate(input.scheduledAt, new Date())) throw new Error("A loja está fechada para pedidos de hoje.");
  const leadHours = Math.max(settings.minimumLeadHours, ...normalizedItems.map(({ product }) => product.antecedenciaMinimaHoras ?? settings.minimumLeadHours));
  validateDeliveryDate(input.scheduledAt, new Date(), leadHours, { operationSchedule: settings.operationSchedule });
  if (!settings.allowMultipleOrdersPerSlot) {
    const conflict = await prisma.order.findFirst({ where: { scheduledAt: input.scheduledAt, status: { not: OrderStatus.CANCELLED } }, select: { id: true } })
      || await prisma.pedido.findFirst({ where: { dataEntrega: input.scheduledAt, status: { not: PedidoStatus.CANCELADO } }, select: { id: true } });
    if (conflict) throw new Error("Esse horário já está reservado.");
  }
  const delivery = input.fulfillmentType === "DELIVERY" ? getDeliveryFee(input.deliveryNeighborhood || "") : { fee: 0, agreed: true };
  if (input.fulfillmentType === "DELIVERY" && (!input.deliveryAddress || !input.deliveryNumber || !input.deliveryNeighborhood)) throw new Error("Endereço de entrega incompleto.");
  const total = Number((normalizedItems.reduce((sum, item) => sum + item.subtotal, 0) + delivery.fee).toFixed(2));
  const payment = calculatePaymentAmounts(total, input.paymentPercentage, input.paymentMethod);
  return { name, phone, email, normalizedItems, delivery, total, payment };
}

export async function createValidatedOrder(input: NormalizedOrderInput) {
  if (input.idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { externalReference: `whatsapp-${input.idempotencyKey}` }, include: { items: true } });
    if (existing) return existing;
  }
  const { name, phone, email, normalizedItems, delivery, total, payment } = await previewValidatedOrder(input);
  const code = `C${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 4).toUpperCase()}`;
  const externalReference = input.idempotencyKey ? `whatsapp-${input.idempotencyKey}` : `cart-${code}`;
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({ data: {
      source: input.source, externalReference, code, scheduledAt: input.scheduledAt,
      customerName: name, customerPhone: phone, customerEmail: email,
      fulfillmentType: input.fulfillmentType,
      deliveryAddress: input.fulfillmentType === "DELIVERY" ? `${input.deliveryAddress}, ${input.deliveryNumber}` : null,
      deliveryReference: input.deliveryReference || null, deliveryNeighborhood: input.deliveryNeighborhood || null,
      deliveryFee: delivery.fee, deliveryFeeAgreed: delivery.agreed, totalAmount: total,
      paymentPercentage: input.paymentPercentage, paymentMethod: input.paymentMethod,
      paymentMethodLabel: payment.methodLabel, feePercent: payment.feePercent,
      feeAmount: payment.feeAmount, chargedAmount: payment.totalToCharge,
      items: { create: normalizedItems.map(({ product, quantities, unitPrice, subtotal }) => ({
        productId: product.id, productName: product.nome, productType: product.productType?.name || String(product.categoria),
        quantity: quantities.usesMinimumQuantity ? quantities.requestedUnits : quantities.quantity,
        unitPrice, subtotal, selectedItems: quantities.selectedItems,
      })) },
    } as Prisma.OrderUncheckedCreateInput, include: { items: true } });
    await recordOrderEvent({ orderId: order.id, event: "ORDER_CREATED", source: input.source, newStatus: order.status, metadata: { entityType: "Order", code, itemCount: order.items.length } }, tx);
    return order;
  });
}
