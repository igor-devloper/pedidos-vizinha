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
  cardapioUrl: readOptional(
    "CARDAPIO_URL",
    "https://pedido.anota.ai/loja/dawn-burguer?f=msa&utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=PAdGRleAR9Z0xleHRuA2FlbQIxMQBzcnRjBmFwcF9pZA8xMjQwMjQ1NzQyODc0MTQAAadlHk_f5xmXN_jqFpVlKU1kY21iVXdzAtA3L1-A42MSXG8VLgZvNhGmIUk3gQ_aem_YWdncwD7MYUn2JV_NcjJwnL5KUsm&brid=YWdncwFkmaDBiRdwHoyXfL5BI4PY&utm_id=97760_v0_s00_e0_tv3"
  ),
  pixKey: readOptional("PIX_KEY", "00980322405"),
  botPhoneNumber: readOptional("BOT_PHONE_NUMBER", "5583993760485"),
  ownerApprovalNumber: readOptional("OWNER_APPROVAL_NUMBER", "558387137721"),
  pickupAddress: readOptional("PICKUP_ADDRESS", "Endereço de retirada não configurado"),
  pickupReference: process.env.PICKUP_REFERENCE?.trim() || undefined,
  pickupHours: readOptional(
    "PICKUP_HOURS",
    "terça a sabádo, das 10h as 17h. Domingo, das 9h as 13h. Segunda, fechado."
  ),
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
