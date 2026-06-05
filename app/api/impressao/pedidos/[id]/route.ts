import { NextResponse } from "next/server";

import { getPedidoReceipt } from "@/lib/pedido-service";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const receipt = await getPedidoReceipt(id);

    return new NextResponse(receipt, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("GET /api/impressao/pedidos/[id] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar impressão." },
      { status: 404 }
    );
  }
}
