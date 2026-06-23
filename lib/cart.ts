import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { calculateDiscountedSubtotal } from "@/lib/descontos";
import { getProdutoComboItens } from "@/lib/produtos";
import { normalizeSaboresList } from "@/lib/sabores";

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

export type CartSelectedItem = {
  tipo: string;
  quantidade: number;
};

export function normalizeCartSelectedItems(value: Prisma.JsonValue | unknown): CartSelectedItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const entry = item as { tipo?: unknown; quantidade?: unknown };
      const tipo = typeof entry.tipo === "string" ? entry.tipo.trim() : "";
      const quantidade = Number(entry.quantidade);

      if (!tipo || !Number.isFinite(quantidade) || quantidade < 0) {
        return null;
      }

      return {
        tipo,
        quantidade: Math.floor(quantidade),
      };
    })
    .filter((item): item is CartSelectedItem => Boolean(item));
}

export function buildInitialSelectedItems(product: {
  categoria: unknown;
  comboItens?: unknown;
  saboresSugeridos?: string[];
}) {
  const comboItens = getProdutoComboItens(product as { comboItens?: unknown });

  if (String(product.categoria) === "COMBO" && comboItens.length > 0) {
    return comboItens.map((item) => ({
      tipo: item.nome,
      quantidade: item.quantidade,
    }));
  }

  return normalizeSaboresList(product.saboresSugeridos || [])
    .slice(0, 2)
    .map((tipo) => ({
      tipo,
      quantidade: 0,
    }));
}

export function getCartProductUnitPrice(product: {
  preco: Prisma.Decimal | number | string;
  emPromocao?: boolean | null;
  descontoPercentual?: Prisma.Decimal | number | string | null;
}) {
  const price = Number(product.preco);

  if (!product.emPromocao) {
    return Number(price.toFixed(2));
  }

  return calculateDiscountedSubtotal(price, Number(product.descontoPercentual || 0)).subtotal;
}

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
    const unitPrice = getCartProductUnitPrice(item.product);
    const subtotal = unitPrice * item.quantity;
    const comboItens = getProdutoComboItens(item.product as { comboItens?: unknown });

    return {
      id: item.id,
      productId: item.productId,
      name: item.product.nome,
      slug: item.product.slug,
      type: item.product.productType?.name || String(item.product.categoria),
      category: String(item.product.categoria),
      quantity: item.quantity,
      unitPrice,
      subtotal,
      image: item.product.imagemBase64,
      totalUnidades: item.product.totalUnidades,
      maxTiposSalgado: item.product.maxTiposSalgado,
      permitePagamentoParcial: item.product.permitePagamentoParcial,
      saboresSugeridos: normalizeSaboresList(item.product.saboresSugeridos),
      comboItens,
      selectedItems: normalizeCartSelectedItems(item.selectedItems),
    };
  });

  return {
    id: cart.id,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: items.reduce((sum, item) => sum + item.subtotal, 0),
  };
}
