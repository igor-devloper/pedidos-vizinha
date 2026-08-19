import { NextResponse } from "next/server";

import { getCurrentCart, normalizeCartSelectedItems, serializeCart, setCartSessionCookie } from "@/lib/cart";
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
    const body = (await req.json()) as { quantity?: number; requestedUnits?: number; selectedItems?: unknown };
    const quantity = Math.max(1, Math.floor(Number(body.quantity || 1)));
    const { cart, isNew, sessionId } = await getCurrentCart();
    const existingItem = await prisma.cartItem.findFirst({
      where: { id, cartId: cart.id },
      include: { product: { include: { productType: true } } },
    });
    if (!existingItem) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
    const usesMinimumQuantity = Boolean(existingItem.product.productType?.allowsMultiple && existingItem.product.productType.minQuantity);
    const requestedUnits = usesMinimumQuantity
      ? Math.floor(Number(body.requestedUnits || existingItem.requestedUnits || existingItem.product.totalUnidades))
      : null;
    if (usesMinimumQuantity && requestedUnits! < Number(existingItem.product.productType?.minQuantity)) {
      return NextResponse.json({ error: `A quantidade mínima é ${existingItem.product.productType?.minQuantity}.` }, { status: 400 });
    }
    const patch: {
      quantity: number;
      requestedUnits?: number | null;
      selectedItems?: ReturnType<typeof normalizeCartSelectedItems>;
    } = { quantity: usesMinimumQuantity ? 1 : quantity, requestedUnits };

    if ("selectedItems" in body) {
      patch.selectedItems = normalizeCartSelectedItems(body.selectedItems);
    }

    await prisma.cartItem.updateMany({
      where: { id, cartId: cart.id },
      data: patch,
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
