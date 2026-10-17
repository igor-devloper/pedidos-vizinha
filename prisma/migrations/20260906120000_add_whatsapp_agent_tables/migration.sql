-- Agente de pedidos do WhatsApp: pausa por conversa, histórico, idempotência e ciclo de pedido do rascunho.
ALTER TABLE "WhatsappOrderDraft"
  ADD COLUMN IF NOT EXISTS "summarySentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "orderSeq" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "wa_conversation" (
    "instance_id" TEXT NOT NULL,
    "remote_jid" TEXT NOT NULL,
    "paused_until" TIMESTAMPTZ(6),
    "pause_reason" TEXT,
    "paused_by" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wa_conversation_pkey" PRIMARY KEY ("instance_id", "remote_jid")
);

CREATE TABLE IF NOT EXISTS "wa_message_log" (
    "id" BIGSERIAL NOT NULL,
    "instance_id" TEXT NOT NULL,
    "remote_jid" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wa_message_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "wa_message_log_instance_id_remote_jid_id_idx" ON "wa_message_log"("instance_id", "remote_jid", "id");

CREATE TABLE IF NOT EXISTS "wa_inbound_seen" (
    "instance_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wa_inbound_seen_pkey" PRIMARY KEY ("instance_id", "message_id")
);
