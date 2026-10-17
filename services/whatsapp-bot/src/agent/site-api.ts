import { config } from "../config.js";
import { requestWhatsappOrder, type OrderResponse } from "../internal-order-client.js";

// Cliente das rotas internas do site: horários, validação de data/hora, resumo e criação do pedido.
// As regras de negócio moram no site; o bot só pergunta.

export type StoreInfo = {
  now: string;
  openNow: boolean;
  closedByOwner: boolean;
  todayHours: string;
  weeklyHours: string[];
  minimumLeadHours: number;
  slotMinutes: number;
  earliestOrderTime: string | null;
  nextOpenDays: string[];
  acceptsOrdersForFutureDates: boolean;
  allowMultipleOrdersPerSlot: boolean;
  weekly: Array<{ weekday: number; name: string; open: boolean; openHour: number | null; closeHour: number | null; text: string }>;
  deliveryFees: Array<{ area: string; fee: number; neighborhoods: string[] }>;
};

export type ScheduleResult = {
  ok: boolean;
  reason?: string;
  suggestions?: string[];
  minimumLeadHours?: number;
};

export type OrderRequestResult = Awaited<ReturnType<typeof requestWhatsappOrder>>;

export type SiteApi = {
  storeInfo(): Promise<StoreInfo>;
  checkSchedule(scheduledAtIso: string, productIds: string[]): Promise<ScheduleResult>;
  requestOrder(draftId: string, preview: boolean): Promise<OrderRequestResult>;
};

async function internalFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let lastStatus = 0;
  for (const key of config.internalOrderApiKeys) {
    const response = await fetch(`${config.appUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...init.headers },
      signal: AbortSignal.timeout(20_000),
    });
    lastStatus = response.status;
    if (response.status === 401) continue;
    if (!response.ok) throw new Error(`Site respondeu ${response.status} em ${path}`);
    return (await response.json()) as T;
  }
  throw new Error(`Site recusou a chave interna (${lastStatus}) em ${path}`);
}

let storeInfoCache: { at: number; value: StoreInfo } | null = null;

export function createSiteApi(): SiteApi {
  return {
    async storeInfo() {
      // Cache curto: o cliente costuma perguntar horário várias vezes seguidas.
      if (storeInfoCache && Date.now() - storeInfoCache.at < 30_000) return storeInfoCache.value;
      const value = await internalFetch<StoreInfo>("/api/internal/store-info");
      storeInfoCache = { at: Date.now(), value };
      return value;
    },
    checkSchedule(scheduledAtIso, productIds) {
      return internalFetch<ScheduleResult>("/api/internal/whatsapp-schedule", {
        method: "POST",
        body: JSON.stringify({ scheduledAt: scheduledAtIso, productIds }),
      });
    },
    requestOrder(draftId, preview) {
      return requestWhatsappOrder(config.appUrl, config.internalOrderApiKeys, draftId, preview);
    },
  };
}

export type { OrderResponse };
