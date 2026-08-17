import { NextResponse } from "next/server";

import {
  buildInitialSelectedItems,
  getCartProductUnitPrice,
  getCurrentCart,
  serializeCart,
  setCartSessionCookie,
} from "@/lib/cart";
import { prisma } from "@/lib/db";
import { getProdutoComboItens } from "@/lib/produtos";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { productId?: string; quantity?: number };
    const productId = String(body.productId || "").trim();
    const quantity = Math.max(1, Math.floor(Number(body.quantity || 1)));

    if (!productId) {
      return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
    }

    const product = await prisma.produto.findFirst({
      where: { id: productId, ativo: true },
      select: {
        id: true,
        preco: true,
        emPromocao: true,
        descontoPercentual: true,
        categoria: true,
        comboItens: true,
        saboresSugeridos: true,
        precisaSelecaoDeTipos: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
    }

    const { cart, isNew, sessionId } = await getCurrentCart();
    const unitPrice = getCartProductUnitPrice(product);

    const cartItem = await prisma.cartItem.upsert({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: product.id,
        },
      },
      update: {
        quantity: { increment: quantity },
        unitPrice,
      },
      create: {
        cartId: cart.id,
        productId: product.id,
        quantity,
        unitPrice,
        selectedItems: buildInitialSelectedItems(product),
      },
    });

    const comboItens = getProdutoComboItens(product);
    if (String(product.categoria) === "COMBO" && comboItens.length > 0) {
      await prisma.cartItem.update({
        where: { id: cartItem.id },
        data: {
          selectedItems: comboItens.map((item) => ({
            tipo: item.nome,
            quantidade: item.quantidade * cartItem.quantity,
          })),
        },
      });
    }

    const updated = await prisma.cart.findUniqueOrThrow({
      where: { id: cart.id },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          include: { product: { include: { productType: true } } },
        },
      },
    });

    const response = NextResponse.json(serializeCart(updated), { status: 201 });

    if (isNew) {
      setCartSessionCookie(response, sessionId);
    }

    return response;
  } catch (error) {
    console.error("POST /api/cart/add error", error);
    return NextResponse.json({ error: "Erro ao adicionar ao carrinho." }, { status: 500 });
  }
}
