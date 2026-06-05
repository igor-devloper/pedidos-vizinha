import { PedidoStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { markPedidoPrinted, updatePedidoStatus } from "@/lib/pedido-service";

const updatePedidoSchema = z.object({
  status: z.nativeEnum(PedidoStatus).optional(),
  printed: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const payload = updatePedidoSchema.parse(await req.json());

    if (payload.printed) {
      const pedido = await markPedidoPrinted(id);
      return NextResponse.json(pedido);
    }

    if (!payload.status) {
      return NextResponse.json({ error: "Informe o status." }, { status: 400 });
    }

    const pedido = await updatePedidoStatus(id, payload.status);
    return NextResponse.json(pedido);
  } catch (error) {
    console.error("PATCH /api/manhia/pedidos/[id] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar pedido." },
      { status: 400 }
    );
  }
}
