import { randomUUID } from "node:crypto";
import { db } from "./db.js";

export type WhatsappDraft = {
  id: string; instanceId: string; remoteJid: string; phone: string;
  customerName: string | null; customerEmail: string | null;
  stage: string; status: string; fulfillmentType: string | null;
  scheduledAt: string | null; deliveryStreet: string | null;
  deliveryNumber: string | null; deliveryNeighborhood: string | null;
  deliveryReference: string | null; paymentMethod: string | null;
  paymentPercentage: number | null; items: unknown[]; siteLinkSentAt: string | null;
  whatsappOfferDueAt: string | null; whatsappOfferSentAt: string | null;
  siteOrderDetectedAt: string | null; orderId: string | null;
  lastCustomerMessageAt: string | null; lastBotMessageAt: string | null;
};

const ALLOWED_COLUMNS = new Set([
  "customerName", "customerEmail", "stage", "status", "fulfillmentType", "scheduledAt",
  "deliveryStreet", "deliveryNumber", "deliveryNeighborhood", "deliveryReference",
  "paymentMethod", "paymentPercentage", "items", "siteLinkSentAt", "whatsappOfferDueAt",
  "whatsappOfferSentAt", "siteOrderDetectedAt", "orderId", "lastCustomerMessageAt", "lastBotMessageAt",
]);

export async function getOrCreateDraft(instanceId: string, remoteJid: string, knownPhone?: string) {
  if (!db) return null;
  const phone = knownPhone?.replace(/\D/g, "") || (remoteJid.endsWith("@s.whatsapp.net") ? remoteJid.replace(/\D/g, "") : "");
  const result = await db.query<WhatsappDraft>(
    `INSERT INTO "WhatsappOrderDraft" (id, "instanceId", "remoteJid", phone, "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,NOW(),NOW())
     ON CONFLICT ("instanceId", "remoteJid") DO UPDATE SET
       phone=CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE "WhatsappOrderDraft".phone END,
       "updatedAt"=NOW()
     RETURNING *`, [randomUUID(), instanceId, remoteJid, phone],
  );
  return result.rows[0] || null;
}

export async function patchDraft(id: string, patch: Record<string, unknown>) {
  if (!db) return null;
  const entries = Object.entries(patch).filter(([key, value]) => ALLOWED_COLUMNS.has(key) && value !== undefined);
  if (!entries.length) return null;
  const setters = entries.map(([key], index) => `"${key}"=$${index + 2}`);
  const values = entries.map(([key, value]) => key === "items" ? JSON.stringify(value) : value);
  const result = await db.query<WhatsappDraft>(
    `UPDATE "WhatsappOrderDraft" SET ${setters.join(",")}, "updatedAt"=NOW() WHERE id=$1 RETURNING *`,
    [id, ...values],
  );
  return result.rows[0] || null;
}

export async function markSiteLinkSent(draftId: string, now = new Date()) {
  if (!db) return null;
  const result = await db.query<WhatsappDraft>(
    `UPDATE "WhatsappOrderDraft"
     SET "siteLinkSentAt"=COALESCE("siteLinkSentAt", $2),
         "whatsappOfferDueAt"=COALESCE("whatsappOfferDueAt", $3),
         status=CASE
           WHEN status='ACTIVE' AND items='[]'::jsonb AND "fulfillmentType" IS NULL
             THEN 'AWAITING_SITE_ORDER'
           ELSE status
         END,
         "updatedAt"=NOW()
     WHERE id=$1 AND "orderId" IS NULL AND "whatsappOfferSentAt" IS NULL
       AND status NOT IN ('HANDOFF','ABANDONED','COMPLETED')
     RETURNING *`,
    [draftId, now, new Date(now.getTime() + 10 * 60_000)],
  );
  return result.rows[0] || null;
}

export async function claimDueWhatsappOffers(limit = 25) {
  if (!db) return [];
  const result = await db.query<WhatsappDraft>(
    `UPDATE "WhatsappOrderDraft" d SET "whatsappOfferSentAt"=NOW(), "updatedAt"=NOW()
     WHERE d.id IN (
       SELECT candidate.id FROM "WhatsappOrderDraft" candidate
       WHERE candidate.status='AWAITING_SITE_ORDER'
         AND candidate."whatsappOfferDueAt" <= NOW()
         AND candidate."whatsappOfferSentAt" IS NULL
         AND candidate."orderId" IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM "Order" o
           WHERE RIGHT(regexp_replace(COALESCE(o."customerPhone",''), '\\D', '', 'g'), 11) = RIGHT(candidate.phone, 11)
             AND o."createdAt" >= candidate."siteLinkSentAt"
         )
       ORDER BY candidate."whatsappOfferDueAt" FOR UPDATE SKIP LOCKED LIMIT $1
     ) RETURNING d.*`, [limit],
  );
  return result.rows;
}

export async function findDraftsForPanel(limit = 100) {
  if (!db) return [];
  const result = await db.query<WhatsappDraft>(
    `SELECT * FROM "WhatsappOrderDraft" ORDER BY "updatedAt" DESC LIMIT $1`, [limit],
  );
  return result.rows;
}
