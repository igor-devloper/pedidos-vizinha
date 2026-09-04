import { db } from "./db.js";
import { logger } from "./logger.js";

export type ProductRecord = {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  preco: string;
  descontoPercentual: string;
  categoria: "CENTO" | "LANCHONETE" | "COMBO";
  emPromocao: boolean;
  totalUnidades: number;
  maxTiposSalgado: number;
  permitePagamentoParcial: boolean;
  saboresSugeridos: string[];
  comboItens: unknown;
  antecedenciaMinimaHoras: number | null;
  precisaSelecaoDeTipos: boolean;
  minQuantity: number | null;
  allowsMultiple: boolean | null;
};

export type StoreSettingsRecord = {
  isOpen: boolean;
  minimumLeadHours: number;
  allowMultipleOrdersPerSlot: boolean;
  operationSchedule: unknown;
};

export function formatCurrencyBR(value: number) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function getProductPricing(product: ProductRecord) {
  const basePrice = Number(product.preco);
  const rawDiscount = product.emPromocao ? Number(product.descontoPercentual || 0) : 0;
  const discountPercent = Number(Math.min(Math.max(rawDiscount, 0), 100).toFixed(2));
  const finalPrice = Number(Math.max(basePrice * (1 - discountPercent / 100), 0).toFixed(2));

  return {
    basePrice,
    discountPercent,
    finalPrice,
    hasDiscount: discountPercent > 0,
    basePriceLabel: formatCurrencyBR(basePrice),
    finalPriceLabel: formatCurrencyBR(finalPrice),
  };
}

export function formatProductPriceForCustomer(product: ProductRecord) {
  const pricing = getProductPricing(product);

  if (!pricing.hasDiscount) {
    return `R$ ${pricing.finalPriceLabel}`;
  }

  return `R$ ${pricing.finalPriceLabel} (de R$ ${pricing.basePriceLabel}, ${pricing.discountPercent}% off)`;
}

export async function listActiveProducts() {
  if (!db) {
    logger.warn("DATABASE_URL not configured for products; Gemini product context unavailable");
    return [] as ProductRecord[];
  }

  try {
    const result = await db.query<ProductRecord>(
      `
        SELECT
          p.id,
          p.slug,
          p.nome,
          p.descricao,
          p.preco::text AS preco,
          p."descontoPercentual"::text AS "descontoPercentual",
          p.categoria,
          p."emPromocao", p."totalUnidades", p."maxTiposSalgado",
          p."permitePagamentoParcial", p."saboresSugeridos", p."comboItens",
          p."antecedenciaMinimaHoras", p."precisaSelecaoDeTipos",
          pt."minQuantity", pt."allowsMultiple"
        FROM "Produto" p
        LEFT JOIN "ProductType" pt ON pt.id = p."productTypeId"
        WHERE p.ativo = true
        ORDER BY p."emPromocao" DESC, p.categoria ASC, p."createdAt" DESC
      `
    );

    return result.rows;
  } catch (error) {
    logger.error({ error }, "Failed to load products for sales agent");
    return [] as ProductRecord[];
  }
}

export async function getStoreSettings() {
  if (!db) return null;
  const result = await db.query<StoreSettingsRecord>(
    `SELECT "isOpen", "minimumLeadHours", "allowMultipleOrdersPerSlot", "operationSchedule"
     FROM "StoreSettings" WHERE id = 'singleton' LIMIT 1`,
  );
  return result.rows[0] || null;
}
