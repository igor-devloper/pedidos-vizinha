CREATE TYPE "OrderEventType" AS ENUM (
  'ORDER_CREATED',
  'PAYMENT_CREATED',
  'PAYMENT_APPROVED',
  'PAYMENT_REJECTED',
  'PAYMENT_CANCELLED',
  'ORDER_STATUS_CHANGED',
  'ORDER_READY',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'ORDER_EDITED',
  'BOT_ORDER_CREATED'
);

CREATE TYPE "OrderEventSource" AS ENUM (
  'SITE',
  'WHATSAPP',
  'ADMIN',
  'MERCADO_PAGO',
  'SYSTEM'
);

CREATE TABLE "OrderEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "event" "OrderEventType" NOT NULL,
  "previousStatus" TEXT,
  "newStatus" TEXT,
  "source" "OrderEventSource" NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");
CREATE INDEX "OrderEvent_event_createdAt_idx" ON "OrderEvent"("event", "createdAt");

-- Sem foreign key e sem ON DELETE CASCADE de proposito: o historico deve
-- sobreviver mesmo a uma eventual acao administrativa futura sobre o pedido.
