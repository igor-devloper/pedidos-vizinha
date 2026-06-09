import { db } from "./db.js";
import { logger } from "./logger.js";

export type ProductRecord = {
  id: string;
  nome: string;
  descricao: string;
  preco: string;
  categoria: "CENTO" | "LANCHONETE" | "COMBO";
  emPromocao: boolean;
};

export async function listActiveProducts() {
  if (!db) {
    logger.warn("DATABASE_URL not configured for products; Gemini product context unavailable");
    return [] as ProductRecord[];
  }

  try {
    const result = await db.query<ProductRecord>(
      `
        SELECT id, nome, descricao, preco::text AS preco, categoria, "emPromocao"
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
