import { NextResponse } from "next/server";

import { getCurrentCart, normalizeCartAudience, serializeCart, setCartSessionCookie } from "@/lib/cart";
import { prisma } from "@/lib/db";
import { CartQuantityValidationError, validateCartItemQuantities } from "@/lib/cart-quantity";

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
    const body = (await req.json()) as { quantity?: number; requestedUnits?: number; selectedItems?: unknown; audience?: string };
    const audience = normalizeCartAudience(body.audience || new URL(req.url).searchParams.get("audience"));
    const { cart, isNew, sessionId } = await getCurrentCart(audience);
    const existingItem = await prisma.cartItem.findFirst({
      where: { id, cartId: cart.id },
      include: { product: { include: { productType: true } } },
    });
    if (!existingItem) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
    const quantities = validateCartItemQuantities({
      product: existingItem.product,
      audience,
      quantity: body.quantity ?? existingItem.quantity,
      requestedUnits: body.requestedUnits ?? existingItem.requestedUnits ?? undefined,
      selectedItems: "selectedItems" in body ? body.selectedItems : existingItem.selectedItems,
      requireCompleteSelection: false,
    });
    const patch: {
      quantity: number;
      requestedUnits?: number | null;
      selectedItems?: ReturnType<typeof validateCartItemQuantities>["selectedItems"];
    } = {
      quantity: quantities.quantity,
      requestedUnits: quantities.usesMinimumQuantity ? quantities.requestedUnits : null,
    };

    if ("selectedItems" in body) {
      patch.selectedItems = quantities.selectedItems;
    }

    await prisma.cartItem.updateMany({
      where: { id, cartId: cart.id },
      data: patch,
    });

    const updated = await loadUpdatedCart(cart.id);
    const response = NextResponse.json(serializeCart(updated, audience));

    if (isNew) {
      setCartSessionCookie(response, sessionId, audience);
    }

    return response;
  } catch (error) {
    console.error("PATCH /api/cart/item/[id] error", error);
    if (error instanceof CartQuantityValidationError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro ao atualizar item." }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const audience = normalizeCartAudience(new URL(req.url).searchParams.get("audience"));
    const { cart, isNew, sessionId } = await getCurrentCart(audience);

    await prisma.cartItem.deleteMany({
      where: { id, cartId: cart.id },
    });

    const updated = await loadUpdatedCart(cart.id);
    const response = NextResponse.json(serializeCart(updated, audience));

    if (isNew) {
      setCartSessionCookie(response, sessionId, audience);
    }

    return response;
  } catch (error) {
    console.error("DELETE /api/cart/item/[id] error", error);
    return NextResponse.json({ error: "Erro ao remover item." }, { status: 500 });
  }
}
