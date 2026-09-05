export function normalizeApiKey(value: string | undefined) {
  return (value || "").trim().replace(/^Bearer\s+/i, "").trim();
}

export function getInternalOrderKeys(env: Record<string, string | undefined>) {
  return [...new Set([env.INTERNAL_ORDER_API_KEY, env.BOT_SERVICE_API_KEY, env.BOT_API_KEY].map(normalizeApiKey).filter(Boolean))];
}

export type OrderResponse = {
  error?: string;
  code?: string;
  summary?: string;
  order?: { id: string; code?: string; chargedAmount: string };
  pixCopyPaste?: string;
  checkoutUrl?: string;
};

export async function requestWhatsappOrder(appUrl: string, keys: string[], draftId: string, preview = false, fetcher: typeof fetch = fetch) {
  for (const key of keys) {
    const response = await fetcher(`${appUrl.replace(/\/$/, "")}/api/internal/whatsapp-orders`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ draftId, preview }),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 401) continue;
    const data = await response.json().catch(() => null) as OrderResponse | null;
    return { ok: response.ok, status: response.status, data };
  }
  return { ok: false, status: 401, data: { code: "INTERNAL_ORDER_UNAUTHORIZED" } as OrderResponse };
}
