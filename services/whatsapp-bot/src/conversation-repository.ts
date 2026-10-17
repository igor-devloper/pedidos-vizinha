import { db } from "./db.js";
import { logger } from "./logger.js";
import { ensureWaSchema } from "./wa-schema.js";

export type LogKind = "in" | "out" | "tool" | "event";

export type LoggedMessage = {
  id: string;
  kind: LogKind;
  content: string;
  meta: unknown;
  createdAt: string;
};

export type ConversationPause = {
  pausedUntil: string | null;
  reason: string | null;
  pausedBy: string | null;
};

/** O mesmo contato pode chegar como "5583...@s.whatsapp.net" ou só dígitos; normaliza a chave. */
export function conversationKey(remoteJidOrNumber: string) {
  return remoteJidOrNumber.includes("@")
    ? remoteJidOrNumber
    : `${remoteJidOrNumber.replace(/\D/g, "")}@s.whatsapp.net`;
}

export async function logMessage(
  instanceId: string,
  remoteJid: string,
  kind: LogKind,
  content: string,
  meta?: unknown
) {
  if (!db) return;
  try {
    await ensureWaSchema();
    await db.query(
      `INSERT INTO "wa_message_log" ("instance_id", "remote_jid", "kind", "content", "meta")
       VALUES ($1::text, $2::text, $3::text, $4::text, $5::jsonb)`,
      [instanceId, conversationKey(remoteJid), kind, content.slice(0, 8000), meta === undefined ? null : JSON.stringify(meta)]
    );
  } catch (error) {
    // Log de conversa nunca pode derrubar o atendimento.
    logger.warn({ error }, "Failed to write conversation log");
  }
}

export async function getRecentMessages(instanceId: string, remoteJid: string, limit: number) {
  if (!db) return [] as LoggedMessage[];
  await ensureWaSchema();
  const { rows } = await db.query<{ id: string; kind: LogKind; content: string; meta: unknown; created_at: string }>(
    `SELECT * FROM (
       SELECT "id"::text AS id, "kind", "content", "meta", "created_at"::text AS created_at
       FROM "wa_message_log"
       WHERE "instance_id" = $1::text AND "remote_jid" = $2::text AND "kind" IN ('in', 'out')
       ORDER BY "id" DESC LIMIT $3::int
     ) recent ORDER BY id::bigint ASC`,
    [instanceId, conversationKey(remoteJid), limit]
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    content: row.content,
    meta: row.meta,
    createdAt: row.created_at,
  }));
}

export async function getConversationLog(instanceId: string, remoteJid: string, limit = 200) {
  if (!db) return [] as LoggedMessage[];
  await ensureWaSchema();
  const { rows } = await db.query<{ id: string; kind: LogKind; content: string; meta: unknown; created_at: string }>(
    `SELECT * FROM (
       SELECT "id"::text AS id, "kind", "content", "meta", "created_at"::text AS created_at
       FROM "wa_message_log"
       WHERE "instance_id" = $1::text AND "remote_jid" = $2::text
       ORDER BY "id" DESC LIMIT $3::int
     ) recent ORDER BY id::bigint ASC`,
    [instanceId, conversationKey(remoteJid), limit]
  );
  return rows.map((row) => ({ id: row.id, kind: row.kind, content: row.content, meta: row.meta, createdAt: row.created_at }));
}

export async function hasOutboundMessage(instanceId: string, remoteJid: string) {
  if (!db) return false;
  await ensureWaSchema();
  const { rows } = await db.query(
    `SELECT 1 FROM "wa_message_log"
     WHERE "instance_id" = $1::text AND "remote_jid" = $2::text AND "kind" = 'out' LIMIT 1`,
    [instanceId, conversationKey(remoteJid)]
  );
  return rows.length > 0;
}

/** Devolve a pausa em vigor, ou null se o bot pode responder. */
export async function getActivePause(instanceId: string, remoteJid: string): Promise<ConversationPause | null> {
  if (!db) return null;
  await ensureWaSchema();
  const { rows } = await db.query<{ paused_until: string | null; pause_reason: string | null; paused_by: string | null }>(
    `SELECT "paused_until"::text AS paused_until, "pause_reason", "paused_by"
     FROM "wa_conversation"
     WHERE "instance_id" = $1::text AND "remote_jid" = $2::text AND "paused_until" > now()`,
    [instanceId, conversationKey(remoteJid)]
  );
  const row = rows[0];
  return row ? { pausedUntil: row.paused_until, reason: row.pause_reason, pausedBy: row.paused_by } : null;
}

export async function pauseConversation(
  instanceId: string,
  remoteJid: string,
  hours: number,
  reason: string,
  pausedBy: "owner" | "agent" | "panel"
) {
  if (!db) return;
  await ensureWaSchema();
  await db.query(
    `INSERT INTO "wa_conversation" ("instance_id", "remote_jid", "paused_until", "pause_reason", "paused_by", "updated_at")
     VALUES ($1::text, $2::text, now() + make_interval(hours => $3::double precision), $4::text, $5::text, now())
     ON CONFLICT ("instance_id", "remote_jid") DO UPDATE SET
       "paused_until" = EXCLUDED."paused_until",
       "pause_reason" = EXCLUDED."pause_reason",
       "paused_by" = EXCLUDED."paused_by",
       "updated_at" = now()`,
    [instanceId, conversationKey(remoteJid), hours, reason.slice(0, 500), pausedBy]
  );
  await logMessage(instanceId, remoteJid, "event", `Bot pausado por ${hours}h (${pausedBy}): ${reason}`);
}

export async function resumeConversation(instanceId: string, remoteJid: string) {
  if (!db) return;
  await ensureWaSchema();
  await db.query(
    `UPDATE "wa_conversation" SET "paused_until" = NULL, "updated_at" = now()
     WHERE "instance_id" = $1::text AND "remote_jid" = $2::text`,
    [instanceId, conversationKey(remoteJid)]
  );
  await logMessage(instanceId, remoteJid, "event", "Bot retomado");
}

/** Marca a mensagem como vista. Falso se já tinha sido processada (idempotência entre reinícios). */
export async function markMessageSeen(instanceId: string, messageId: string) {
  if (!db || !messageId) return true;
  try {
    await ensureWaSchema();
    const { rows } = await db.query(
      `INSERT INTO "wa_inbound_seen" ("instance_id", "message_id") VALUES ($1::text, $2::text)
       ON CONFLICT DO NOTHING RETURNING 1`,
      [instanceId, messageId]
    );
    return rows.length > 0;
  } catch (error) {
    logger.warn({ error }, "Failed to persist inbound idempotency key; falling back to memory only");
    return true;
  }
}

export async function pruneOldRecords() {
  if (!db) return;
  await ensureWaSchema();
  await db.query(`DELETE FROM "wa_inbound_seen" WHERE "seen_at" < now() - interval '3 days'`);
  await db.query(`DELETE FROM "wa_message_log" WHERE "created_at" < now() - interval '90 days'`);
}

export type ConversationSummary = {
  instanceId: string;
  remoteJid: string;
  lastAt: string;
  lastKind: LogKind;
  lastContent: string;
  pausedUntil: string | null;
  pauseReason: string | null;
  customerName: string | null;
  phone: string | null;
  draftStatus: string | null;
  draftStage: string | null;
  itemCount: number;
};

export async function listConversations(limit = 60): Promise<ConversationSummary[]> {
  if (!db) return [];
  await ensureWaSchema();
  const { rows } = await db.query<{
    instance_id: string;
    remote_jid: string;
    last_at: string;
    last_kind: LogKind;
    last_content: string;
    paused_until: string | null;
    pause_reason: string | null;
    customer_name: string | null;
    phone: string | null;
    draft_status: string | null;
    draft_stage: string | null;
    item_count: number | null;
  }>(
    `SELECT l."instance_id", l."remote_jid", l."created_at"::text AS last_at, l."kind" AS last_kind, l."content" AS last_content,
            CASE WHEN c."paused_until" > now() THEN c."paused_until"::text END AS paused_until, c."pause_reason",
            d."customerName" AS customer_name, d."phone", d."status" AS draft_status, d."stage" AS draft_stage,
            CASE WHEN d."items" IS NULL THEN NULL ELSE jsonb_array_length(d."items") END AS item_count
     FROM (
       SELECT DISTINCT ON ("instance_id", "remote_jid") *
       FROM "wa_message_log" WHERE "kind" IN ('in', 'out')
       ORDER BY "instance_id", "remote_jid", "id" DESC
     ) l
     LEFT JOIN "wa_conversation" c ON c."instance_id" = l."instance_id" AND c."remote_jid" = l."remote_jid"
     LEFT JOIN "WhatsappOrderDraft" d ON d."instanceId" = l."instance_id" AND d."remoteJid" = l."remote_jid"
     ORDER BY l."id" DESC
     LIMIT $1::int`,
    [limit]
  );
  return rows.map((row) => ({
    instanceId: row.instance_id,
    remoteJid: row.remote_jid,
    lastAt: row.last_at,
    lastKind: row.last_kind,
    lastContent: row.last_content,
    pausedUntil: row.paused_until,
    pauseReason: row.pause_reason,
    customerName: row.customer_name,
    phone: row.phone,
    draftStatus: row.draft_status,
    draftStage: row.draft_stage,
    itemCount: row.item_count ?? 0,
  }));
}
