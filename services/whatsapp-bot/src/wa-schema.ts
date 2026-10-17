import { db } from "./db.js";
import { logger } from "./logger.js";

// Mantido em sincronia com prisma/migrations/20260905120000_add_whatsapp_session_tables.
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
