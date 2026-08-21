import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { calculateDiscountedSubtotal } from "@/lib/descontos";
import { getProdutoComboItens } from "@/lib/produtos";
import { normalizeSaboresList } from "@/lib/sabores";

export const CART_SESSION_COOKIE = "vizinha_cart_session";
export type CartAudience = "VIZINHA" | "CONFEITEIRA";

export function normalizeCartAudience(value: unknown): CartAudience {
  return value === "CONFEITEIRA" ? "CONFEITEIRA" : "VIZINHA";
}

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
  precisaSelecaoDeTipos?: boolean;
}) {
  if (product.precisaSelecaoDeTipos === false) return [];
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
  precoConfeiteira?: Prisma.Decimal | number | string | null;
  emPromocao?: boolean | null;
  descontoPercentual?: Prisma.Decimal | number | string | null;
}, audience: CartAudience = "VIZINHA") {
  if (audience === "CONFEITEIRA" && product.precoConfeiteira != null) {
    return Number(Number(product.precoConfeiteira).toFixed(2));
  }
  const price = Number(product.preco);

  if (!product.emPromocao) {
    return Number(price.toFixed(2));
  }

  return calculateDiscountedSubtotal(price, Number(product.descontoPercentual || 0)).subtotal;
}

export async function getCartSessionId(audience: CartAudience = "VIZINHA") {
  const cookieStore = await cookies();
  const cookieName = audience === "CONFEITEIRA" ? `${CART_SESSION_COOKIE}_confeiteira` : CART_SESSION_COOKIE;
  const existing = cookieStore.get(cookieName)?.value;

  if (existing) {
    return { sessionId: existing, isNew: false };
  }

  return { sessionId: randomUUID(), isNew: true };
}

export function setCartSessionCookie(response: Response, sessionId: string, audience: CartAudience = "VIZINHA") {
  const cookieName = audience === "CONFEITEIRA" ? `${CART_SESSION_COOKIE}_confeiteira` : CART_SESSION_COOKIE;
  response.headers.append(
    "Set-Cookie",
    `${cookieName}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
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

export async function getCurrentCart(audience: CartAudience = "VIZINHA") {
  const { sessionId, isNew } = await getCartSessionId(audience);
  const cart = await getOrCreateCart(sessionId);

  return { sessionId, isNew, cart };
}

export function serializeCart(cart: CartWithItems, audience: CartAudience = "VIZINHA") {
  const items = cart.items.map((item) => {
    const unitPrice = getCartProductUnitPrice(item.product, audience);
    const requestedUnits = item.requestedUnits ?? item.product.totalUnidades * item.quantity;
    const confectionerMinimum = item.product.quantidadeMinimaConfeiteira;
    const usesMinimumQuantity = audience === "CONFEITEIRA"
      ? Boolean(confectionerMinimum)
      : Boolean(item.product.productType?.allowsMultiple && item.product.productType.minQuantity);
    const subtotal = usesMinimumQuantity
      ? Number((unitPrice * (requestedUnits / item.product.totalUnidades)).toFixed(2))
      : unitPrice * item.quantity;
    const comboItens = getProdutoComboItens(item.product as { comboItens?: unknown });

    return {
      id: item.id,
      productId: item.productId,
      name: item.product.nome,
      slug: item.product.slug,
      type: item.product.productType?.name || String(item.product.categoria),
      category: String(item.product.categoria),
      quantity: item.quantity,
      requestedUnits,
      usesMinimumQuantity,
      minimumQuantity: audience === "CONFEITEIRA" ? confectionerMinimum ?? 1 : item.product.productType?.minQuantity ?? 1,
      minimumLeadHours: item.product.antecedenciaMinimaHoras,
      unitPrice,
      subtotal,
      image: item.product.imagemBase64,
      totalUnidades: item.product.totalUnidades,
      maxTiposSalgado: item.product.maxTiposSalgado,
      permitePagamentoParcial: item.product.permitePagamentoParcial,
      saboresSugeridos: normalizeSaboresList(item.product.saboresSugeridos),
      comboItens,
      precisaSelecaoDeTipos: item.product.precisaSelecaoDeTipos,
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
