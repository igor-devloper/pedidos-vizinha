import "dotenv/config";

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

export const config = {
  port: Number(process.env.PORT || 8787),
  nodeEnv: readOptional("NODE_ENV", "development"),
  baseUrl: readOptional("BASE_URL", `http://localhost:${process.env.PORT || 8787}`),
  apiKey: readRequired("BOT_API_KEY"),
  webhookUrl: process.env.WEBHOOK_URL?.trim() || undefined,
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
  geminiModel: readOptional("GEMINI_MODEL", "gemini-2.5-flash"),
  businessName: readOptional("BUSINESS_NAME", "Vizinha Salgateria"),
  cardapioUrl: readOptional("CARDAPIO_URL", "https://vizinhasalgateria.site/cardapio"),
  pickupAddress: readOptional("PICKUP_ADDRESS", "Endereco de retirada nao configurado"),
  pickupReference: process.env.PICKUP_REFERENCE?.trim() || undefined,
  pickupHours: readOptional("PICKUP_HOURS", "Retirada a combinar"),
  authDir: readOptional("AUTH_DIR", "./data/auth"),
  storeDir: readOptional("STORE_DIR", "./data/store"),
  instanceFile: readOptional("INSTANCE_FILE", "./data/instances.json"),
  instanceBootIds: (process.env.INSTANCE_BOOT_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  qrTtlSeconds: Number(process.env.QR_TTL_SECONDS || 60),
  railwayPublicDomain: process.env.RAILWAY_PUBLIC_DOMAIN?.trim() || undefined,
};
