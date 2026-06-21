import { NextResponse } from "next/server";

import { getCurrentCart, serializeCart, setCartSessionCookie } from "@/lib/cart";
import { prisma } from "@/lib/db";

export async function GET() {
  const { cart, isNew, sessionId } = await getCurrentCart();
  const response = NextResponse.json(serializeCart(cart));

  if (isNew) {
    setCartSessionCookie(response, sessionId);
  }

  return response;
}

export async function DELETE() {
  const { cart, isNew, sessionId } = await getCurrentCart();

  await prisma.cartItem.deleteMany({
    where: { cartId: cart.id },
  });

  const updated = await prisma.cart.findUniqueOrThrow({
    where: { id: cart.id },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: { product: { include: { productType: true } } },
      },
    },
  });

  const response = NextResponse.json(serializeCart(updated));

  if (isNew) {
    setCartSessionCookie(response, sessionId);
  }

  return response;
}
