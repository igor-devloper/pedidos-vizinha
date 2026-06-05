import { NextResponse } from "next/server";

import { getPedidoForView } from "@/lib/pedido-service";

export async function GET(
  _req: Request,
  context: { params: Promise<{ codigo: string }> }
) {
  try {
    const { codigo } = await context.params;
    const pedido = await getPedidoForView(codigo);

    if (!pedido) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    return NextResponse.json(pedido);
  } catch (error) {
    console.error("GET /api/pedidos/[codigo] error", error);
    return NextResponse.json(
      { error: "Não foi possível carregar o pedido." },
      { status: 500 }
    );
  }
}
