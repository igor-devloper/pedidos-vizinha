import { prisma } from "@/lib/db";
import { acceptPaidCartOrder } from "@/lib/cart-order-service";
import { findLatestMercadoPagoPaymentByExternalReference } from "@/lib/mercado-pago";

type MercadoPagoCartPayment = {
  id: string | number;
  status: string;
  external_reference?: string;
};

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

  const current = await prisma.order.findUnique({
    where: { externalReference: payment.external_reference },
  });

  if (!current) {
    console.warn(
      `[MP webhook] Order do carrinho nao encontrado para a referencia ${payment.external_reference}.`
    );
    return null;
  }

  const orderStatus = getOrderStatusFromMercadoPagoStatus(payment.status);
  const order = await prisma.order.update({
    where: { id: current.id },
    data: {
      status: orderStatus,
      mercadoPagoPaymentId: String(payment.id),
    },
    include: { items: true },
  });

  if (orderStatus === "PAID" && order.cartId) {
    await prisma.cartItem.deleteMany({
      where: { cartId: order.cartId },
    });
  }

  if (orderStatus === "PAID") {
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
