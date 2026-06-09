import { randomUUID } from "node:crypto";

import { db } from "./db.js";
import { logger } from "./logger.js";

export type OrderMenuCategory = "CENTO" | "LANCHONETE" | "COMBO";
export type BotOrderStatus =
  | "PENDING_OWNER_APPROVAL"
  | "AWAITING_PAYMENT"
  | "PAYMENT_REPORTED"
  | "CONFIRMED"
  | "REJECTED";
export type BotOrderPaymentStatus = "PENDING" | "HALF" | "FULL";

export type BotOrder = {
  id: string;
  code: string;
  instanceId: string;
  leadId: string | null;
  customerRemoteJid: string;
  customerPhoneNumber: string | null;
  customerName: string | null;
  menuCategoria: OrderMenuCategory;
  eventoDetalhes: string;
  horarioEntrega: string;
  observacoes: string | null;
  summary: string;
  status: BotOrderStatus;
  ownerReason: string | null;
  paymentStatus: BotOrderPaymentStatus;
  createdAt: string;
  updatedAt: string;
};

type CreateBotOrderInput = {
  instanceId: string;
  leadId?: string | null;
  customerRemoteJid: string;
  customerPhoneNumber?: string | null;
  customerName?: string | null;
  menuCategoria: OrderMenuCategory;
  eventoDetalhes: string;
  horarioEntrega: string;
  observacoes?: string | null;
  summary: string;
};

type BotOrderPatch = Partial<{
  customerName: string | null;
  summary: string;
  status: BotOrderStatus;
  ownerReason: string | null;
  paymentStatus: BotOrderPaymentStatus;
}>;

function generateOrderCode() {
  return randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
}

export async function createBotOrder(input: CreateBotOrderInput) {
  if (!db) {
    logger.warn("DATABASE_URL not configured for bot orders; skipping order persistence");
    return null;
  }

  try {
    const code = generateOrderCode();
    const result = await db.query<BotOrder>(
      `
        INSERT INTO "BotOrder" (
          "id",
          code,
          "instanceId",
          "leadId",
          "customerRemoteJid",
          "customerPhoneNumber",
          "customerName",
          "menuCategoria",
          "eventoDetalhes",
          "horarioEntrega",
          observacoes,
          summary,
          status,
          "paymentStatus",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::"CategoriaProduto", $9, $10, $11, $12,
          'PENDING_OWNER_APPROVAL', 'PENDING', NOW(), NOW()
        )
        RETURNING *
      `,
      [
        randomUUID(),
        code,
        input.instanceId,
        input.leadId || null,
        input.customerRemoteJid,
        input.customerPhoneNumber || null,
        input.customerName || null,
        input.menuCategoria,
        input.eventoDetalhes,
        input.horarioEntrega,
        input.observacoes || null,
        input.summary,
      ]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error({ error }, "Failed to create bot order");
    return null;
  }
}

export async function findLatestOpenOrderByCustomer(
  instanceId: string,
  customerRemoteJid: string
) {
  if (!db) {
    return null;
  }

  try {
    const result = await db.query<BotOrder>(
      `
        SELECT *
        FROM "BotOrder"
        WHERE "instanceId" = $1
          AND "customerRemoteJid" = $2
          AND status IN ('PENDING_OWNER_APPROVAL', 'AWAITING_PAYMENT', 'PAYMENT_REPORTED')
        ORDER BY "createdAt" DESC
        LIMIT 1
      `,
      [instanceId, customerRemoteJid]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error({ error }, "Failed to load latest customer bot order");
    return null;
  }
}

export async function findBotOrderByCode(instanceId: string, code: string) {
  if (!db) {
    return null;
  }

  try {
    const result = await db.query<BotOrder>(
      `
        SELECT *
        FROM "BotOrder"
        WHERE "instanceId" = $1 AND code = $2
        LIMIT 1
      `,
      [instanceId, code.toUpperCase()]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error({ error, code }, "Failed to load bot order by code");
    return null;
  }
}

export async function updateBotOrder(orderId: string, patch: BotOrderPatch) {
  if (!db) {
    return null;
  }

  try {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);

    if (entries.length === 0) {
      return null;
    }

    const setters = entries.map(([key], index) => `"${key}" = $${index + 2}`);
    const values = entries.map(([, value]) => value);

    const result = await db.query<BotOrder>(
      `
        UPDATE "BotOrder"
        SET ${setters.join(", ")}, "updatedAt" = NOW()
        WHERE "id" = $1
        RETURNING *
      `,
      [orderId, ...values]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error({ error, orderId }, "Failed to update bot order");
    return null;
  }
}
