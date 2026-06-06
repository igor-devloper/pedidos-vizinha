ALTER TABLE "Pedido"
ADD COLUMN "saldoExternalReference" TEXT,
ADD COLUMN "saldoPreferenceId" TEXT,
ADD COLUMN "saldoInitPoint" TEXT,
ADD COLUMN "saldoTotalCobrado" DECIMAL(10,2),
ADD COLUMN "saldoPagoAt" TIMESTAMP(3),
ADD COLUMN "saldoCobrancaEnviadaAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Pedido_saldoExternalReference_key" ON "Pedido"("saldoExternalReference");
