import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export const CART_SESSION_COOKIE = "vizinha_cart_session";

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      product: {
        include: {
          productType: true,
        },
      },
    },
  },
};

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export async function getCartSessionId() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(CART_SESSION_COOKIE)?.value;

  if (existing) {
    return { sessionId: existing, isNew: false };
  }

  return { sessionId: randomUUID(), isNew: true };
}

export function setCartSessionCookie(response: Response, sessionId: string) {
  response.headers.append(
    "Set-Cookie",
    `${CART_SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
}

export async function getOrCreateCart(sessionId: string) {
  return prisma.cart.upsert({
    where: { sessionId },
    update: {},
    create: { sessionId },
    include: cartInclude,
  });
}

export async function getCurrentCart() {
  const { sessionId, isNew } = await getCartSessionId();
  const cart = await getOrCreateCart(sessionId);

  return { sessionId, isNew, cart };
}

export function serializeCart(cart: CartWithItems) {
  const items = cart.items.map((item) => {
    const unitPrice = Number(item.unitPrice);
    const subtotal = unitPrice * item.quantity;

    return {
      id: item.id,
      productId: item.productId,
      name: item.product.nome,
      slug: item.product.slug,
      type: item.product.productType?.name || String(item.product.categoria),
      quantity: item.quantity,
      unitPrice,
      subtotal,
      image: item.product.imagemBase64,
    };
  });

  return {
    id: cart.id,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: items.reduce((sum, item) => sum + item.subtotal, 0),
  };
}
