import { OrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { serializeCartOrderForAdmin, updateCartOrderStatus } from "@/lib/cart-order-service";

const updateOrderSchema = z.object({
  status: z.nativeEnum(OrderStatus),
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
    const payload = updateOrderSchema.parse(await req.json());
    const order = await updateCartOrderStatus(id, payload.status);

    return NextResponse.json(serializeCartOrderForAdmin(order));
  } catch (error) {
    console.error("PATCH /api/manhia/orders/[id] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível atualizar o pedido." },
      { status: 400 }
    );
  }
}
