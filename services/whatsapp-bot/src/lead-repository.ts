import { randomUUID } from "node:crypto";

import { db } from "./db.js";
import { logger } from "./logger.js";

export type BotLead = {
  id: string;
  instanceId: string;
  remoteJid: string;
  pushName: string | null;
  phoneNumber: string | null;
  nome: string | null;
  stage: string;
  status: string;
  intent: string | null;
  eventoDetalhes: string | null;
  bairroRetirada: string | null;
  observacoes: string | null;
  lastInboundText: string | null;
  lastOutboundText: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateLeadInput = {
  instanceId: string;
  remoteJid: string;
  pushName?: string;
};

type LeadPatch = Partial<{
  pushName: string | null;
  phoneNumber: string | null;
  nome: string | null;
  stage: string;
  status: string;
  intent: string | null;
  eventoDetalhes: string | null;
  bairroRetirada: string | null;
  observacoes: string | null;
  lastInboundText: string | null;
  lastOutboundText: string | null;
}>;

function toPhoneNumber(remoteJid: string) {
  return remoteJid.replace("@s.whatsapp.net", "").replace(/\D/g, "") || null;
}

export async function getOrCreateLead(input: CreateLeadInput) {
  if (!db) {
    logger.warn("DATABASE_URL not configured for bot leads; skipping lead persistence");
    return null;
  }

  try {
    const existing = await db.query<BotLead>(
      `
        SELECT *
        FROM "BotLead"
        WHERE "instanceId" = $1 AND "remoteJid" = $2
        LIMIT 1
      `,
      [input.instanceId, input.remoteJid]
    );

    if (existing.rows[0]) {
      return existing.rows[0];
    }

    const created = await db.query<BotLead>(
      `
        INSERT INTO "BotLead" (
          "id", "instanceId", "remoteJid", "pushName", "phoneNumber", "stage", "status", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, 'new', 'open', NOW(), NOW())
        RETURNING *
      `,
      [
        randomUUID(),
        input.instanceId,
        input.remoteJid,
        input.pushName || null,
        toPhoneNumber(input.remoteJid),
      ]
    );

    return created.rows[0] || null;
  } catch (error) {
    logger.error({ error }, "Failed to get or create bot lead");
    return null;
  }
}

export async function updateLead(leadId: string, patch: LeadPatch) {
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

    const result = await db.query<BotLead>(
      `
        UPDATE "BotLead"
        SET ${setters.join(", ")}, "updatedAt" = NOW()
        WHERE "id" = $1
        RETURNING *
      `,
      [leadId, ...values]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error({ error, leadId }, "Failed to update bot lead");
    return null;
  }
}
