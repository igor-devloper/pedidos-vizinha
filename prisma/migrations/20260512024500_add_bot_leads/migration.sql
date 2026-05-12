CREATE TABLE "BotLead" (
  "id" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "remoteJid" TEXT NOT NULL,
  "pushName" TEXT,
  "phoneNumber" TEXT,
  "nome" TEXT,
  "stage" TEXT NOT NULL DEFAULT 'new',
  "status" TEXT NOT NULL DEFAULT 'open',
  "intent" TEXT,
  "eventoDetalhes" TEXT,
  "bairroRetirada" TEXT,
  "observacoes" TEXT,
  "lastInboundText" TEXT,
  "lastOutboundText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BotLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BotLead_instanceId_remoteJid_key" ON "BotLead"("instanceId", "remoteJid");
