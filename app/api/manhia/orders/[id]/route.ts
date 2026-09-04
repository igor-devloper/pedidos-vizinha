import { OrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { editCartOrder, serializeCartOrderForAdmin, updateCartOrderStatus } from "@/lib/cart-order-service";

const updateOrderSchema = z.union([
  z.object({ status: z.nativeEnum(OrderStatus) }),
  z.object({
    action: z.literal("EDIT"),
    items: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().positive(), selectedItems: z.array(z.object({ tipo: z.string().min(1), quantidade: z.coerce.number().int().positive() })).optional() })).min(1),
    fulfillmentType: z.enum(["PICKUP", "DELIVERY"]),
    deliveryAddress: z.string().optional(),
    deliveryReference: z.string().optional(),
    deliveryNeighborhood: z.string().optional(),
    deliveryPlaceId: z.string().optional(),
    deliveryCity: z.string().optional(),
    deliveryLatitude: z.number().optional(),
    deliveryLongitude: z.number().optional(),
    scheduledAt: z.string().min(16),
    paidAmount: z.coerce.number().min(0),
  }),
]);

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
    const order = "action" in payload
      ? await editCartOrder({ id, ...payload })
      : await updateCartOrderStatus(id, payload.status);

    return NextResponse.json(serializeCartOrderForAdmin(order));
  } catch (error) {
    console.error("PATCH /api/manhia/orders/[id] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível atualizar o pedido." },
      { status: 400 }
    );
  }
}
