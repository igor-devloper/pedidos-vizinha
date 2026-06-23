ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';

ALTER TABLE "Order"
  ADD COLUMN "notificadoClienteAt" TIMESTAMP(3),
  ADD COLUMN "notificadoVizinhaAt" TIMESTAMP(3),
  ADD COLUMN "notificadoProntoClienteAt" TIMESTAMP(3),
  ADD COLUMN "prontoAt" TIMESTAMP(3),
  ADD COLUMN "impressoAutomaticamenteAt" TIMESTAMP(3);
