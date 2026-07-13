import { NextResponse } from "next/server";
import { z } from "zod";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { markPedidoPaidManually } from "@/lib/pedido-service";

const manualPaymentSchema = z.object({
  valorPago: z.coerce.number().positive().optional(),
  observacao: z.string().trim().max(300).optional().or(z.literal("")),
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
    const payload = manualPaymentSchema.parse(await req.json().catch(() => ({})));
    const pedido = await markPedidoPaidManually({
      id,
      valorPago: payload.valorPago,
      observacao: payload.observacao || "Pagamento em dinheiro confirmado",
    });

    return NextResponse.json(pedido);
  } catch (error) {
    console.error("PATCH /api/manhia/pedidos/[id]/pagamento-manual error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao confirmar pagamento manual." },
      { status: 400 }
    );
  }
}
