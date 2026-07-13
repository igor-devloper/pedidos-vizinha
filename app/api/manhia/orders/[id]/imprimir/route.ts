import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { printCartOrderReceipt, serializeCartOrderForAdmin } from "@/lib/cart-order-service";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const order = await printCartOrderReceipt(id);

    return NextResponse.json(serializeCartOrderForAdmin(order));
  } catch (error) {
    console.error("POST /api/manhia/orders/[id]/imprimir error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao imprimir pedido do carrinho." },
      { status: 400 }
    );
  }
}
