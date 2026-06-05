DO $$
BEGIN
    CREATE TYPE "MetodoPagamento" AS ENUM ('PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "PedidoStatus" AS ENUM ('PENDENTE_PAGAMENTO', 'PAGO', 'EM_PREPARO', 'ENTREGUE', 'CANCELADO');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Produto"
ADD COLUMN "slug" TEXT,
ADD COLUMN "totalUnidades" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "maxTiposSalgado" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "permitePagamentoParcial" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "saboresSugeridos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Produto"
SET "slug" = 'produto-' || "id"
WHERE "slug" IS NULL;

ALTER TABLE "Produto"
ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Produto_slug_key" ON "Produto"("slug");

CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "clienteNome" TEXT NOT NULL,
    "clienteTelefone" TEXT NOT NULL,
    "clienteEmail" TEXT,
    "observacoes" TEXT,
    "dataEntrega" TIMESTAMP(3) NOT NULL,
    "percentualPagamento" INTEGER NOT NULL,
    "metodoPagamento" "MetodoPagamento" NOT NULL,
    "metodoPagamentoLabel" TEXT NOT NULL,
    "taxaPercentual" DECIMAL(5,2) NOT NULL,
    "taxaValor" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "totalCobrado" DECIMAL(10,2) NOT NULL,
    "valorPago" DECIMAL(10,2),
    "totalUnidades" INTEGER NOT NULL,
    "totalTipos" INTEGER NOT NULL,
    "status" "PedidoStatus" NOT NULL DEFAULT 'PENDENTE_PAGAMENTO',
    "produtoNomeSnapshot" TEXT NOT NULL,
    "produtoPrecoSnapshot" DECIMAL(10,2) NOT NULL,
    "mpPreferenceId" TEXT,
    "mpPaymentId" TEXT,
    "mpMerchantOrderId" TEXT,
    "mpExternalReference" TEXT NOT NULL,
    "mpInitPoint" TEXT,
    "mpStatus" TEXT,
    "mpStatusDetail" TEXT,
    "mpWebhookPayload" JSONB,
    "notificadoClienteAt" TIMESTAMP(3),
    "notificadoVizinhaAt" TIMESTAMP(3),
    "impressoAutomaticamenteAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "produtoId" TEXT NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PedidoItem" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pedidoId" TEXT NOT NULL,

    CONSTRAINT "PedidoItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Pedido_codigo_key" ON "Pedido"("codigo");
CREATE UNIQUE INDEX "Pedido_mpExternalReference_key" ON "Pedido"("mpExternalReference");

ALTER TABLE "Pedido"
ADD CONSTRAINT "Pedido_produtoId_fkey"
FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PedidoItem"
ADD CONSTRAINT "PedidoItem_pedidoId_fkey"
FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
