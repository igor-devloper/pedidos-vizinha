import "dotenv/config";
import { getInternalOrderKeys } from "./internal-order-client.js";

function readRequired(key: string) {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }

  return value;
}

function readOptional(key: string, fallback: string) {
  return process.env[key]?.trim() || fallback;
}

function readNumber(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed >= 0 && process.env[key]?.trim() ? parsed : fallback;
}

export const config = {
  port: Number(process.env.PORT || 8787),
  nodeEnv: readOptional("NODE_ENV", "development"),
  baseUrl: readOptional("BASE_URL", `http://localhost:${process.env.PORT || 8787}`),
  apiKey: readRequired("BOT_API_KEY"),
  internalOrderApiKeys: getInternalOrderKeys(process.env),
  appUrl: readOptional("APP_URL", "http://localhost:3000").replace(/\/$/, ""),
  webhookUrl: process.env.WEBHOOK_URL?.trim() || undefined,
  geminiApiKey:
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    undefined,
  geminiModel: readOptional("GEMINI_MODEL", "gemini-2.5-flash"),
  businessName: readOptional("BUSINESS_NAME", "Vizinha Salgateria"),
  cardapioUrl: readOptional(
    "CARDAPIO_URL",
    `${(process.env.APP_URL?.trim() || "https://www.vizinhasalgateria.site").replace(/\/$/, "")}/cardapio`
  ),
  pixKey: readOptional("PIX_KEY", "00980322405"),
  botPhoneNumber: readOptional("BOT_PHONE_NUMBER", "5583993760485"),
  ownerApprovalNumber: readOptional("OWNER_APPROVAL_NUMBER", "558387137721"),
  pickupAddress: readOptional("PICKUP_ADDRESS", "Endereço de retirada não configurado"),
  pickupReference: process.env.PICKUP_REFERENCE?.trim() || undefined,
  authDir: readOptional("AUTH_DIR", "./data/auth"),
  storeDir: readOptional("STORE_DIR", "./data/store"),
  instanceFile: readOptional("INSTANCE_FILE", "./data/instances.json"),
  printJobsFile: readOptional("PRINT_JOBS_FILE", "./data/print-jobs.ndjson"),
  instanceBootIds: (process.env.INSTANCE_BOOT_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  qrTtlSeconds: Number(process.env.QR_TTL_SECONDS || 60),
  // "tools" = agente com ferramentas validadas em código; "legacy" = fluxo antigo (volta rápida se algo falhar).
  agentMode: readOptional("WHATSAPP_AGENT_MODE", "tools") === "legacy" ? ("legacy" as const) : ("tools" as const),
  batchQuietMs: readNumber("BATCH_QUIET_MS", 6_000),
  batchMaxWaitMs: readNumber("BATCH_MAX_WAIT_MS", 20_000),
  handoffPauseHours: readNumber("HANDOFF_PAUSE_HOURS", 6),
  draftTtlHours: readNumber("DRAFT_TTL_HOURS", 24),
  maxInboundAgeSeconds: readNumber("MAX_INBOUND_AGE_SECONDS", 600),
  agentHistoryLimit: readNumber("AGENT_HISTORY_LIMIT", 30),
  railwayPublicDomain: process.env.RAILWAY_PUBLIC_DOMAIN?.trim() || undefined,
};
