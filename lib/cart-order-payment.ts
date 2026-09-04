import { prisma } from "@/lib/db";
import { acceptPaidCartOrder } from "@/lib/cart-order-service";
import { findLatestMercadoPagoPaymentByExternalReference } from "@/lib/mercado-pago";
import { getPaymentAuditEvent, getStatusAuditEvent, recordOrderEvent } from "@/lib/order-audit";
import { formatCurrency } from "@/lib/pedidos";
import { sendWhatsappText } from "@/lib/whatsapp";

type MercadoPagoCartPayment = {
  id: string | number;
  status: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
};

export class CartOrderPaymentApplyError extends Error {
  constructor(
    message: string,
    public readonly context: Record<string, unknown>,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "CartOrderPaymentApplyError";
  }
}

export function getOrderStatusFromMercadoPagoStatus(status: string) {
  if (status === "approved") {
    return "PAID" as const;
  }

  if (["cancelled", "refunded", "charged_back"].includes(status)) {
    return "CANCELLED" as const;
  }

  return "PENDING" as const;
}

export async function applyCartOrderPayment(payment: MercadoPagoCartPayment) {
  if (!payment.external_reference?.startsWith("cart-")) {
    return null;
  }

  console.log("[MP webhook] Buscando order do carrinho:", {
    externalReference: payment.external_reference,
    paymentId: payment.id,
    paymentStatus: payment.status,
  });

  const current = await prisma.order.findFirst({
    where: {
      OR: [
        { externalReference: payment.external_reference },
        { saldoExternalReference: payment.external_reference },
      ],
    },
  });

  if (!current) {
    console.warn(
      `[MP webhook] Order do carrinho não encontrado para a referência ${payment.external_reference}.`
    );
    return null;
  }

  const orderStatus = getOrderStatusFromMercadoPagoStatus(payment.status);
  const isBalancePayment =
    current.saldoExternalReference === payment.external_reference;
  const expectedAmount = isBalancePayment
    ? Number(current.saldoTotalCobrado || 0)
    : Number(current.chargedAmount || 0);
  if (payment.status === "approved") {
    if (typeof payment.transaction_amount !== "number") {
      throw new CartOrderPaymentApplyError("Pagamento aprovado sem valor confirmado pelo Mercado Pago.", {
        orderId: current.id,
        paymentId: payment.id,
        externalReference: payment.external_reference,
      });
    }
    if (Math.abs(payment.transaction_amount - expectedAmount) > 0.01) {
      throw new CartOrderPaymentApplyError("Valor aprovado diverge do valor esperado do pedido.", {
        orderId: current.id,
        paymentId: payment.id,
        externalReference: payment.external_reference,
        expectedAmount,
        receivedAmount: payment.transaction_amount,
      });
    }
  }
  const alreadyApplied = isBalancePayment
    ? Boolean(current.saldoPagoAt && current.saldoPaymentId === String(payment.id))
    : current.status === "PAID" && current.mercadoPagoPaymentId === String(payment.id);
  if (alreadyApplied) {
    console.info("[MP webhook] Pagamento duplicado ignorado", {
      orderId: current.id,
      paymentId: String(payment.id),
      balance: isBalancePayment,
    });
    return prisma.order.findUnique({ where: { id: current.id }, include: { items: true } });
  }
  const shouldProvision = payment.status === "approved" &&
    (isBalancePayment ? !current.saldoPagoAt : current.status !== "PAID");
  const shouldThankBalancePayment =
    isBalancePayment && payment.status === "approved" && !current.saldoPagoAt;
  const paidAmount = expectedAmount;
  let order;

  try {
    if (payment.status === "approved") {
      const claimed = await prisma.order.updateMany({
        where: isBalancePayment
          ? { id: current.id, saldoPagoAt: null }
          : { id: current.id, status: { not: "PAID" } },
        data: isBalancePayment
          ? {
              saldoPaymentId: String(payment.id),
              saldoPagoAt: new Date(),
              provisionAmount: { increment: Number((paidAmount * 0.1).toFixed(2)) },
              provisionTransferredAt: null,
            }
          : {
              status: "PAID",
              mercadoPagoPaymentId: String(payment.id),
              provisionAmount: { increment: Number((paidAmount * 0.1).toFixed(2)) },
              provisionTransferredAt: null,
            },
      });
      if (claimed.count === 0) {
        console.info("[MP webhook] Pagamento concorrente/duplicado ignorado", {
          orderId: current.id, paymentId: String(payment.id), balance: isBalancePayment,
        });
        return prisma.order.findUnique({ where: { id: current.id }, include: { items: true } });
      }
      order = await prisma.order.findUniqueOrThrow({ where: { id: current.id }, include: { items: true } });
    } else {
    order = await prisma.order.update({
      where: { id: current.id },
      data: isBalancePayment
        ? {
            saldoPaymentId: String(payment.id),
            saldoPagoAt:
              payment.status === "approved" ? new Date() : current.saldoPagoAt,
            provisionAmount: shouldProvision
              ? Number((Number(current.provisionAmount) + paidAmount * 0.1).toFixed(2))
              : current.provisionAmount,
            provisionTransferredAt: shouldProvision ? null : current.provisionTransferredAt,
          }
        : {
            status: orderStatus,
            mercadoPagoPaymentId: String(payment.id),
            provisionAmount: shouldProvision
              ? Number((Number(current.provisionAmount) + paidAmount * 0.1).toFixed(2))
              : current.provisionAmount,
            provisionTransferredAt: shouldProvision ? null : current.provisionTransferredAt,
          },
      include: { items: true },
    });
    }
  } catch (error) {
    throw new CartOrderPaymentApplyError(
      "Falha ao atualizar status do order do carrinho.",
      {
        orderId: current.id,
        externalReference: payment.external_reference,
        paymentId: payment.id,
        paymentStatus: payment.status,
        orderStatus,
      },
      { cause: error }
    );
  }

  console.log("[MP webhook] Order do carrinho atualizado:", {
    orderId: order.id,
    externalReference: order.externalReference,
    status: order.status,
    paymentId: payment.id,
  });

  const paymentEvent = getPaymentAuditEvent(payment.status);
  if (paymentEvent) {
    await recordOrderEvent({
      orderId: order.id,
      event: paymentEvent,
      source: "MERCADO_PAGO",
      previousStatus: isBalancePayment ? current.status : current.status,
      newStatus: order.status,
      metadata: {
        entityType: "Order",
        paymentId: String(payment.id),
        externalReference: payment.external_reference,
        paymentStatus: payment.status,
        balance: isBalancePayment,
      },
    });
  }
  if (!isBalancePayment && order.status !== current.status) {
    await recordOrderEvent({
      orderId: order.id,
      event: getStatusAuditEvent(order.status),
      source: "MERCADO_PAGO",
      previousStatus: current.status,
      newStatus: order.status,
      metadata: {
        entityType: "Order",
        paymentId: String(payment.id),
        trigger: "PAYMENT_STATUS",
      },
    });
  }

  if (shouldThankBalancePayment && order.customerPhone) {
    await sendWhatsappText(
      order.customerPhone,
      `✅ *Saldo confirmado!*\nRecebemos o pagamento de *${formatCurrency(paidAmount)}* do seu pedido #${order.code || order.id.slice(0, 10).toUpperCase()}.\n\nMuito obrigada pela preferência! 💛`,
    ).catch((error) => console.error("Falha ao agradecer pagamento de saldo", { orderId: order.id, error }));
  }

  if (!isBalancePayment && orderStatus === "PAID" && order.cartId) {
    try {
      const cleanup = await prisma.cartItem.deleteMany({
        where: { cartId: order.cartId },
      });
      console.info("[cart-cleanup] paid cart items removed; order retained", {
        orderId: order.id,
        cartId: order.cartId,
        removedCartItemCount: cleanup.count,
        retainedOrderItemCount: order.items.length,
      });
    } catch (error) {
      throw new CartOrderPaymentApplyError(
        "Falha ao limpar carrinho após pagamento aprovado.",
        {
          orderId: order.id,
          cartId: order.cartId,
          externalReference: order.externalReference,
          paymentId: payment.id,
        },
        { cause: error }
      );
    }
  }

  if (!isBalancePayment && orderStatus === "PAID") {
    return acceptPaidCartOrder(order);
  }

  return order;
}

export async function syncCartOrderPaymentByExternalReference(externalReference: string) {
  const payment = await findLatestMercadoPagoPaymentByExternalReference(externalReference);

  if (!payment) {
    return null;
  }

  return applyCartOrderPayment(payment);
}
