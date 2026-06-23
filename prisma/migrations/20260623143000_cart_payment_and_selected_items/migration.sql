ALTER TABLE "CartItem"
  ADD COLUMN "selectedItems" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "Order"
  ADD COLUMN "paymentPercentage" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "paymentMethod" "MetodoPagamento" NOT NULL DEFAULT 'PIX',
  ADD COLUMN "paymentMethodLabel" TEXT NOT NULL DEFAULT 'Pix',
  ADD COLUMN "feePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "feeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "chargedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE "Order"
SET "chargedAmount" = "totalAmount"
WHERE "chargedAmount" = 0;

ALTER TABLE "OrderItem"
  ADD COLUMN "selectedItems" JSONB NOT NULL DEFAULT '[]';
