import { getInternalOrderKeys, normalizeApiKey } from "@/services/whatsapp-bot/src/internal-order-client";

/** Autorização das rotas internas chamadas pelo bot do WhatsApp (chave compartilhada). */
export function hasValidInternalAuthorization(request: Request) {
  const supplied = normalizeApiKey(request.headers.get("authorization") || "");
  const accepted = getInternalOrderKeys(process.env);
  return supplied.length > 0 && accepted.includes(supplied);
}
