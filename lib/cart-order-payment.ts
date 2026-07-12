import { prisma } from "@/lib/db";
import { acceptPaidCartOrder } from "@/lib/cart-order-service";
import { findLatestMercadoPagoPaymentByExternalReference } from "@/lib/mercado-pago";

type MercadoPagoCartPayment = {
  id: string | number;
  status: string;
  status_detail?: string;
  external_reference?: string;
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

  if (["cancelled", "rejected", "refunded", "charged_back"].includes(status)) {
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
      `[MP webhook] Order do carrinho nao encontrado para a referencia ${payment.external_reference}.`
    );
    return null;
  }

  const orderStatus = getOrderStatusFromMercadoPagoStatus(payment.status);
  const isBalancePayment =
    current.saldoExternalReference === payment.external_reference;
  let order;

  try {
    order = await prisma.order.update({
      where: { id: current.id },
      data: isBalancePayment
        ? {
            saldoPaymentId: String(payment.id),
            saldoPagoAt:
              payment.status === "approved" ? new Date() : current.saldoPagoAt,
          }
        : {
            status: orderStatus,
            mercadoPagoPaymentId: String(payment.id),
          },
      include: { items: true },
    });
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

  if (!isBalancePayment && orderStatus === "PAID" && order.cartId) {
    try {
      await prisma.cartItem.deleteMany({
        where: { cartId: order.cartId },
      });
    } catch (error) {
      throw new CartOrderPaymentApplyError(
        "Falha ao limpar carrinho apos pagamento aprovado.",
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
