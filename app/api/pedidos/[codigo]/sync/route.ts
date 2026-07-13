import { NextResponse } from "next/server";

import { syncPedidoPaymentByExternalReference } from "@/lib/pedido-service";

export async function POST(
  _req: Request,
  context: { params: Promise<{ codigo: string }> }
) {
  try {
    const { codigo } = await context.params;
    const pedido = await syncPedidoPaymentByExternalReference(codigo);

    return NextResponse.json(pedido);
  } catch (error) {
    console.error("POST /api/pedidos/[codigo]/sync error", error);
    return NextResponse.json(
      { error: "Não foi possível sincronizar o pagamento." },
      { status: 500 }
    );
  }
}
