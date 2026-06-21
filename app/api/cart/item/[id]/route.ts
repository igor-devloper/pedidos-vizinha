import { NextResponse } from "next/server";

import { getCurrentCart, serializeCart, setCartSessionCookie } from "@/lib/cart";
import { prisma } from "@/lib/db";

async function loadUpdatedCart(cartId: string) {
  return prisma.cart.findUniqueOrThrow({
    where: { id: cartId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: { product: { include: { productType: true } } },
      },
    },
  });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await req.json()) as { quantity?: number };
    const quantity = Math.max(1, Math.floor(Number(body.quantity || 1)));
    const { cart, isNew, sessionId } = await getCurrentCart();

    await prisma.cartItem.updateMany({
      where: { id, cartId: cart.id },
      data: { quantity },
    });

    const updated = await loadUpdatedCart(cart.id);
    const response = NextResponse.json(serializeCart(updated));

    if (isNew) {
      setCartSessionCookie(response, sessionId);
    }

    return response;
  } catch (error) {
    console.error("PATCH /api/cart/item/[id] error", error);
    return NextResponse.json({ error: "Erro ao atualizar item." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { cart, isNew, sessionId } = await getCurrentCart();

    await prisma.cartItem.deleteMany({
      where: { id, cartId: cart.id },
    });

    const updated = await loadUpdatedCart(cart.id);
    const response = NextResponse.json(serializeCart(updated));

    if (isNew) {
      setCartSessionCookie(response, sessionId);
    }

    return response;
  } catch (error) {
    console.error("DELETE /api/cart/item/[id] error", error);
    return NextResponse.json({ error: "Erro ao remover item." }, { status: 500 });
  }
}
