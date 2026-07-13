import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { printPedidoReceipt } from "@/lib/pedido-service";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const pedido = await printPedidoReceipt(id);

    return NextResponse.json(pedido);
  } catch (error) {
    console.error("POST /api/manhia/pedidos/[id]/imprimir error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao imprimir pedido." },
      { status: 400 }
    );
  }
}
