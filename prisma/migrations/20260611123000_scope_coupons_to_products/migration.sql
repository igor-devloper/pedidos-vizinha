-- AlterTable
ALTER TABLE "CupomDesconto"
ADD COLUMN "produtoId" TEXT;

-- Backfill existing coupons to the newest product when possible.
UPDATE "CupomDesconto"
SET "produtoId" = (
  SELECT "id"
  FROM "Produto"
  ORDER BY "createdAt" DESC
  LIMIT 1
)
WHERE "produtoId" IS NULL;

-- AlterTable
ALTER TABLE "CupomDesconto"
ALTER COLUMN "produtoId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "CupomDesconto"
ADD CONSTRAINT "CupomDesconto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
