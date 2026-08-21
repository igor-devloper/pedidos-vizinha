ALTER TABLE "Produto"
  ADD COLUMN "precoConfeiteira" DECIMAL(10,2),
  ADD COLUMN "quantidadeMinimaConfeiteira" INTEGER,
  ADD COLUMN "ativoConfeiteira" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Order" ADD COLUMN "isConfeiteira" BOOLEAN NOT NULL DEFAULT false;
