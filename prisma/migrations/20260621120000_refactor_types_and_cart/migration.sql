CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

CREATE TABLE "ProductType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "minQuantity" INTEGER,
  "allowsMultiple" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Cart" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CartItem" (
  "id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "cartId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
  "mercadoPagoId" TEXT,
  "mercadoPagoPreferenceId" TEXT,
  "mercadoPagoInitPoint" TEXT,
  "mercadoPagoPaymentId" TEXT,
  "externalReference" TEXT NOT NULL,
  "customerName" TEXT,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  "totalAmount" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "cartId" TEXT,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItem" (
  "id" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "productType" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "subtotal" DECIMAL(10,2) NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Produto" ADD COLUMN "productTypeId" TEXT;

CREATE UNIQUE INDEX "ProductType_name_key" ON "ProductType"("name");
CREATE UNIQUE INDEX "Cart_sessionId_key" ON "Cart"("sessionId");
CREATE UNIQUE INDEX "CartItem_cartId_productId_key" ON "CartItem"("cartId", "productId");
CREATE UNIQUE INDEX "Order_externalReference_key" ON "Order"("externalReference");

ALTER TABLE "Produto" ADD CONSTRAINT "Produto_productTypeId_fkey"
  FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ProductType" ("id", "name", "description", "minQuantity", "allowsMultiple", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Cento', '100 unidades de salgado', 100, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Meio Cento', '50 unidades de salgado', 50, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Porção', '30 unidades de salgado', 30, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Avulso', 'Produto vendido por unidade', 1, true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET
  "minQuantity" = EXCLUDED."minQuantity",
  "allowsMultiple" = EXCLUDED."allowsMultiple",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Produto"
SET "productTypeId" = (
  SELECT "id" FROM "ProductType"
  WHERE "name" = CASE
    WHEN "Produto"."categoria" = 'CENTO' AND "Produto"."totalUnidades" = 50 THEN 'Meio Cento'
    WHEN "Produto"."categoria" = 'CENTO' AND "Produto"."totalUnidades" = 30 THEN 'Porção'
    WHEN "Produto"."categoria" = 'LANCHONETE' THEN 'Avulso'
    ELSE 'Cento'
  END
  LIMIT 1
)
WHERE "productTypeId" IS NULL;
