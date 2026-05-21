CREATE TYPE "CategoriaProduto" AS ENUM ('CENTO', 'LANCHONETE');

ALTER TABLE "Produto"
ADD COLUMN "categoria" "CategoriaProduto" NOT NULL DEFAULT 'CENTO';

ALTER TABLE "BotLead"
ADD COLUMN "menuCategoria" "CategoriaProduto",
ADD COLUMN "horarioEntrega" TEXT;

CREATE TABLE "BotOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "leadId" TEXT,
    "customerRemoteJid" TEXT NOT NULL,
    "customerPhoneNumber" TEXT,
    "customerName" TEXT,
    "menuCategoria" "CategoriaProduto" NOT NULL,
    "eventoDetalhes" TEXT NOT NULL,
    "horarioEntrega" TEXT NOT NULL,
    "observacoes" TEXT,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_OWNER_APPROVAL',
    "ownerReason" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BotOrder_code_key" ON "BotOrder"("code");
CREATE INDEX "BotOrder_customerRemoteJid_idx" ON "BotOrder"("customerRemoteJid");
CREATE INDEX "BotOrder_instanceId_idx" ON "BotOrder"("instanceId");
