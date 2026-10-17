-- Sessão do WhatsApp (Baileys) persistida no banco, para sobreviver a deploys.
CREATE TABLE IF NOT EXISTS "wa_auth" (
    "instance_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wa_auth_pkey" PRIMARY KEY ("instance_id", "key")
);

CREATE TABLE IF NOT EXISTS "wa_instance" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wa_instance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "wa_lock" (
    "instance_id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "wa_lock_pkey" PRIMARY KEY ("instance_id")
);
