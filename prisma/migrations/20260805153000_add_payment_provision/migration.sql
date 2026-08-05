ALTER TABLE "Order"
ADD COLUMN "provisionAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "provisionTransferredAt" TIMESTAMP(3);

ALTER TABLE "Pedido"
ADD COLUMN "provisionAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "provisionTransferredAt" TIMESTAMP(3);
