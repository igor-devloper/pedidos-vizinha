import { NextResponse } from "next/server";

import { getCurrentCart, normalizeCartAudience, serializeCart, setCartSessionCookie } from "@/lib/cart";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const audience = normalizeCartAudience(new URL(req.url).searchParams.get("audience"));
  const { cart, isNew, sessionId } = await getCurrentCart(audience);
  const response = NextResponse.json(serializeCart(cart, audience));

  if (isNew) {
    setCartSessionCookie(response, sessionId, audience);
  }

  return response;
}

export async function DELETE(req: Request) {
  const audience = normalizeCartAudience(new URL(req.url).searchParams.get("audience"));
  const { cart, isNew, sessionId } = await getCurrentCart(audience);

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

  const response = NextResponse.json(serializeCart(updated, audience));

  if (isNew) {
    setCartSessionCookie(response, sessionId, audience);
  }

  return response;
}
