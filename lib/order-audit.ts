import {
  OrderEventSource,
  OrderEventType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db";

type AuditClient = Pick<Prisma.TransactionClient, "orderEvent">;

export type OrderAuditInput = {
  orderId: string;
  event: OrderEventType;
  source: OrderEventSource;
  previousStatus?: string | null;
  newStatus?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export function getStatusAuditEvent(status: string): OrderEventType {
  if (status === "READY" || status === "PRONTO") return OrderEventType.ORDER_READY;
  if (status === "DELIVERED" || status === "ENTREGUE") return OrderEventType.ORDER_DELIVERED;
  if (status === "CANCELLED" || status === "CANCELADO") return OrderEventType.ORDER_CANCELLED;
  return OrderEventType.ORDER_STATUS_CHANGED;
}

export function getPaymentAuditEvent(status: string): OrderEventType | null {
  if (status === "approved") return OrderEventType.PAYMENT_APPROVED;
  if (status === "rejected") return OrderEventType.PAYMENT_REJECTED;
  if (["cancelled", "refunded", "charged_back"].includes(status)) {
    return OrderEventType.PAYMENT_CANCELLED;
  }
  return null;
}

export async function recordOrderEvent(
  input: OrderAuditInput,
  client: AuditClient = prisma,
) {
  const event = await client.orderEvent.create({
    data: {
      orderId: input.orderId,
      event: input.event,
      source: input.source,
      previousStatus: input.previousStatus ?? null,
      newStatus: input.newStatus ?? null,
      metadata: input.metadata ?? {},
    },
  });

  console.info("[order-audit] event recorded", {
    auditEventId: event.id,
    orderId: input.orderId,
    event: input.event,
    source: input.source,
    previousStatus: input.previousStatus ?? null,
    newStatus: input.newStatus ?? null,
  });

  return event;
}
