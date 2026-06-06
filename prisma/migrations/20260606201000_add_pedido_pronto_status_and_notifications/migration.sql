ALTER TYPE "PedidoStatus" ADD VALUE IF NOT EXISTS 'PRONTO';

ALTER TABLE "Pedido"
ADD COLUMN "prontoAt" TIMESTAMP(3),
ADD COLUMN "notificadoProntoClienteAt" TIMESTAMP(3),
ADD COLUMN "notificadoToleranciaAt" TIMESTAMP(3);
