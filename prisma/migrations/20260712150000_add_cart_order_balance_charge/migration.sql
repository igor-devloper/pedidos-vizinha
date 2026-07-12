ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "saldoExternalReference" TEXT,
  ADD COLUMN IF NOT EXISTS "saldoPreferenceId" TEXT,
  ADD COLUMN IF NOT EXISTS "saldoPaymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "saldoInitPoint" TEXT,
  ADD COLUMN IF NOT EXISTS "saldoTotalCobrado" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "saldoPagoAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "saldoCobrancaEnviadaAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Order_saldoExternalReference_key"
  ON "Order"("saldoExternalReference");
