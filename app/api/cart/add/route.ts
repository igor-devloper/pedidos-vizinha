import { NextResponse } from "next/server";

import {
  buildInitialSelectedItems,
  getCartProductUnitPrice,
  getCurrentCart,
  normalizeCartAudience,
  serializeCart,
  setCartSessionCookie,
} from "@/lib/cart";
import { prisma } from "@/lib/db";
import { getProdutoComboItens } from "@/lib/produtos";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { productId?: string; quantity?: number; requestedUnits?: number; audience?: string };
    const audience = normalizeCartAudience(body.audience);
    const productId = String(body.productId || "").trim();
    const quantity = Math.max(1, Math.floor(Number(body.quantity || 1)));

    if (!productId) {
      return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
    }

    const product = await prisma.produto.findFirst({
      where: { id: productId, ativo: true, ...(audience === "CONFEITEIRA" ? { ativoConfeiteira: true } : {}) },
      select: {
        id: true,
        preco: true,
        precoConfeiteira: true,
        quantidadeMinimaConfeiteira: true,
        emPromocao: true,
        descontoPercentual: true,
        categoria: true,
        comboItens: true,
        saboresSugeridos: true,
        precisaSelecaoDeTipos: true,
        totalUnidades: true,
        productType: { select: { minQuantity: true, allowsMultiple: true } },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
    }

    const { cart, isNew, sessionId } = await getCurrentCart(audience);
    const unitPrice = getCartProductUnitPrice(product, audience);
    const minimumQuantity = audience === "CONFEITEIRA" ? product.quantidadeMinimaConfeiteira : product.productType?.minQuantity;
    const usesMinimumQuantity = audience === "CONFEITEIRA" ? Boolean(minimumQuantity) : Boolean(product.productType?.allowsMultiple && minimumQuantity);
    const requestedUnits = usesMinimumQuantity
      ? Math.floor(Number(body.requestedUnits || minimumQuantity || product.totalUnidades))
      : null;

    if (usesMinimumQuantity && requestedUnits! < Number(minimumQuantity)) {
      return NextResponse.json({ error: `A quantidade mínima é ${product.productType?.minQuantity}.` }, { status: 400 });
    }

    const cartItem = await prisma.cartItem.upsert({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: product.id,
        },
      },
      update: {
        quantity: usesMinimumQuantity ? 1 : { increment: quantity },
        requestedUnits: usesMinimumQuantity ? requestedUnits : undefined,
        unitPrice,
      },
      create: {
        cartId: cart.id,
        productId: product.id,
        quantity: usesMinimumQuantity ? 1 : quantity,
        requestedUnits,
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

    const response = NextResponse.json(serializeCart(updated, audience), { status: 201 });

    if (isNew) {
      setCartSessionCookie(response, sessionId, audience);
    }

    return response;
  } catch (error) {
    console.error("POST /api/cart/add error", error);
    return NextResponse.json({ error: "Erro ao adicionar ao carrinho." }, { status: 500 });
  }
}
