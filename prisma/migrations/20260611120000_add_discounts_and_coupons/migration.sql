-- AlterTable
ALTER TABLE "Produto"
ADD COLUMN "descontoPercentual" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CupomDesconto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "divulgadorNome" TEXT NOT NULL,
    "divulgadorContato" TEXT,
    "descricao" TEXT,
    "descontoPercentual" DECIMAL(5,2) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CupomDesconto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CupomDesconto_codigo_key" ON "CupomDesconto"("codigo");

-- AlterTable
ALTER TABLE "Pedido"
ADD COLUMN "descontoPercentual" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "descontoValor" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "cupomCodigoSnapshot" TEXT,
ADD COLUMN "cupomDivulgadorSnapshot" TEXT,
ADD COLUMN "cupomId" TEXT;

-- AddForeignKey
ALTER TABLE "Pedido"
ADD CONSTRAINT "Pedido_cupomId_fkey" FOREIGN KEY ("cupomId") REFERENCES "CupomDesconto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
