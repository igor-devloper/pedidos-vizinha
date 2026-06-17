import { db } from "./db.js";
import { logger } from "./logger.js";

export type ProductRecord = {
  id: string;
  nome: string;
  descricao: string;
  preco: string;
  descontoPercentual: string;
  categoria: "CENTO" | "LANCHONETE" | "COMBO";
  emPromocao: boolean;
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
          id,
          nome,
          descricao,
          preco::text AS preco,
          "descontoPercentual"::text AS "descontoPercentual",
          categoria,
          "emPromocao"
        FROM "Produto"
        WHERE ativo = true
        ORDER BY "emPromocao" DESC, categoria ASC, "createdAt" DESC
      `
    );

    return result.rows;
  } catch (error) {
    logger.error({ error }, "Failed to load products for sales agent");
    return [] as ProductRecord[];
  }
}
