DROP INDEX IF EXISTS "Pedido_dataEntrega_active_key";

ALTER TABLE "StoreSettings"
ADD COLUMN IF NOT EXISTS "allowMultipleOrdersPerSlot" BOOLEAN NOT NULL DEFAULT false;
