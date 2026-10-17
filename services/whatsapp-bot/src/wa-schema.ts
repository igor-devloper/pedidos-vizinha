import { db } from "./db.js";
import { logger } from "./logger.js";

// Mantido em sincronia com prisma/migrations/20260905120000_add_whatsapp_session_tables
// e 20260906120000_add_whatsapp_agent_tables.
// O bot também cria as tabelas (IF NOT EXISTS) para não depender de `prisma migrate deploy`.
export const WA_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "wa_auth" (
    "instance_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wa_auth_pkey" PRIMARY KEY ("instance_id", "key")
  )`,
  `CREATE TABLE IF NOT EXISTS "wa_instance" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wa_instance_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "wa_lock" (
    "instance_id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "wa_lock_pkey" PRIMARY KEY ("instance_id")
  )`,
  `DO $$ BEGIN
    IF to_regclass('"WhatsappOrderDraft"') IS NOT NULL THEN
      ALTER TABLE "WhatsappOrderDraft"
        ADD COLUMN IF NOT EXISTS "summarySentAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "orderSeq" INTEGER NOT NULL DEFAULT 0;
    END IF;
  END $$`,
  `CREATE TABLE IF NOT EXISTS "wa_conversation" (
    "instance_id" TEXT NOT NULL,
    "remote_jid" TEXT NOT NULL,
    "paused_until" TIMESTAMPTZ(6),
    "pause_reason" TEXT,
    "paused_by" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wa_conversation_pkey" PRIMARY KEY ("instance_id", "remote_jid")
)`,
  `CREATE TABLE IF NOT EXISTS "wa_message_log" (
    "id" BIGSERIAL NOT NULL,
    "instance_id" TEXT NOT NULL,
    "remote_jid" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wa_message_log_pkey" PRIMARY KEY ("id")
)`,
  `CREATE INDEX IF NOT EXISTS "wa_message_log_instance_id_remote_jid_id_idx" ON "wa_message_log"("instance_id", "remote_jid", "id")`,
  `CREATE TABLE IF NOT EXISTS "wa_inbound_seen" (
    "instance_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wa_inbound_seen_pkey" PRIMARY KEY ("instance_id", "message_id")
)`,
];

let ensured: Promise<void> | null = null;

export function ensureWaSchema() {
  if (!db) {
    return Promise.resolve();
  }

  const pool = db;
  ensured ??= (async () => {
    for (const statement of WA_SCHEMA_STATEMENTS) {
      await pool.query(statement);
    }
    logger.info("WhatsApp session tables ready");
  })().catch((error) => {
    ensured = null;
    throw error;
  });

  return ensured;
}
