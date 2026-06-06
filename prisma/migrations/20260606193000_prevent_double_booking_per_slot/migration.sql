CREATE UNIQUE INDEX "Pedido_dataEntrega_active_key"
ON "Pedido"("dataEntrega")
WHERE "status" <> 'CANCELADO';
