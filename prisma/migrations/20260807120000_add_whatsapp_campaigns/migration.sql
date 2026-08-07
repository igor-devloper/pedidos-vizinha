CREATE TABLE "WhatsappCampaign" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "delaySeconds" INTEGER NOT NULL DEFAULT 15,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "total" INTEGER NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsappCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsappCampaignRecipient" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "campaignId" TEXT NOT NULL,
    CONSTRAINT "WhatsappCampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsappCampaignRecipient_campaignId_phone_key" ON "WhatsappCampaignRecipient"("campaignId", "phone");
CREATE INDEX "WhatsappCampaignRecipient_campaignId_status_idx" ON "WhatsappCampaignRecipient"("campaignId", "status");
ALTER TABLE "WhatsappCampaignRecipient" ADD CONSTRAINT "WhatsappCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WhatsappCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
