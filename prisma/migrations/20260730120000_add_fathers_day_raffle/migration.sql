CREATE TABLE "RaffleEntry" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT,
    "pedidoId" TEXT,
    CONSTRAINT "RaffleEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RaffleDraw" (
    "id" TEXT NOT NULL,
    "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryId" TEXT NOT NULL,
    CONSTRAINT "RaffleDraw_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RaffleEntry_code_key" ON "RaffleEntry"("code");
CREATE UNIQUE INDEX "RaffleEntry_orderId_key" ON "RaffleEntry"("orderId");
CREATE UNIQUE INDEX "RaffleEntry_pedidoId_key" ON "RaffleEntry"("pedidoId");

ALTER TABLE "RaffleEntry" ADD CONSTRAINT "RaffleEntry_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleEntry" ADD CONSTRAINT "RaffleEntry_pedidoId_fkey"
FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleDraw" ADD CONSTRAINT "RaffleDraw_entryId_fkey"
FOREIGN KEY ("entryId") REFERENCES "RaffleEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
