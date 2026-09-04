CREATE TYPE "OrderSource" AS ENUM ('SITE', 'WHATSAPP', 'ADMIN');

ALTER TABLE "Order"
  ADD COLUMN "source" "OrderSource" NOT NULL DEFAULT 'SITE';

CREATE TABLE "WhatsappOrderDraft" (
  "id" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "remoteJid" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "customerName" TEXT,
  "customerEmail" TEXT,
  "stage" TEXT NOT NULL DEFAULT 'COLLECTING',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "fulfillmentType" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "deliveryStreet" TEXT,
  "deliveryNumber" TEXT,
  "deliveryNeighborhood" TEXT,
  "deliveryReference" TEXT,
  "paymentMethod" "MetodoPagamento",
  "paymentPercentage" INTEGER,
  "items" JSONB NOT NULL DEFAULT '[]',
  "siteLinkSentAt" TIMESTAMP(3),
  "whatsappOfferDueAt" TIMESTAMP(3),
  "whatsappOfferSentAt" TIMESTAMP(3),
  "siteOrderDetectedAt" TIMESTAMP(3),
  "orderId" TEXT,
  "lastCustomerMessageAt" TIMESTAMP(3),
  "lastBotMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappOrderDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsappOrderDraft_orderId_key" ON "WhatsappOrderDraft"("orderId");
CREATE UNIQUE INDEX "WhatsappOrderDraft_instanceId_remoteJid_key" ON "WhatsappOrderDraft"("instanceId", "remoteJid");
CREATE INDEX "WhatsappOrderDraft_status_whatsappOfferDueAt_idx" ON "WhatsappOrderDraft"("status", "whatsappOfferDueAt");
CREATE INDEX "WhatsappOrderDraft_phone_createdAt_idx" ON "WhatsappOrderDraft"("phone", "createdAt");

ALTER TABLE "WhatsappOrderDraft"
  ADD CONSTRAINT "WhatsappOrderDraft_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
