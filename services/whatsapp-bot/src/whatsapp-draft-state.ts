import { validateCartItemQuantities } from "./order-quantity.js";
import type { CartQuantityProduct } from "./order-quantity.js";

export type DraftProduct = CartQuantityProduct & {
  id: string; nome: string; saboresSugeridos: string[];
  minQuantity: number | null; allowsMultiple: boolean | null;
};

type WhatsappDraftState = {
  items: unknown[]; fulfillmentType: string | null; scheduledAt: string | null;
  deliveryStreet: string | null; deliveryNumber: string | null;
  deliveryNeighborhood: string | null; deliveryReference: string | null;
  customerName: string | null; customerEmail: string | null;
  paymentMethod: string | null; paymentPercentage: number | null;
  phone?: string;
};

const simplify = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function normalizeFulfillmentType(value: unknown) {
  const text = simplify(value);
  if (/entrega|entregar|delivery|levar|motoboy/.test(text)) return "DELIVERY";
  if (/retirada|retirar|buscar|pickup/.test(text)) return "PICKUP";
  return undefined;
}

export function parseBrazilianScheduledAt(value: unknown, now = new Date()) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const iso = new Date(/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/(Z|[+-]\d{2}:\d{2})$/i.test(raw) ? `${raw}-03:00` : raw);
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && !Number.isNaN(iso.getTime())) return iso.toISOString();
  const text = simplify(raw);
  const time = text.match(/\b(?:as|a|para)\s*(\d{1,2})(?:[:h](\d{2}))?\s*(?:h|hrs|horas)?\b/)
    || text.match(/\b(\d{1,2})(?:[:h](\d{2}))\s*(?:h|hrs|horas)?\b/)
    || text.match(/\b(\d{1,2})\s*(?:h|hr|hrs|horas)\b/);
  const day = text.match(/\bdia\s+(\d{1,2})(?:\s*(?:\/|de)\s*(0?[1-9]|1[0-2])\b)?/);
  if (!time || (!day && !/amanha/.test(text))) return undefined;
  const localNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  let year = localNow.getFullYear();
  let month = day?.[2] ? Number(day[2]) - 1 : localNow.getMonth();
  const date = day ? Number(day[1]) : localNow.getDate() + 1;
  if (day && !day[2] && date < localNow.getDate()) month += 1;
  if (month > 11) { month = 0; year += 1; }
  const hour = Number(time[1]);
  const minute = Number(time[2] || 0);
  if (hour > 23 || minute > 59) return undefined;
  return new Date(Date.UTC(year, month, date, hour + 3, minute)).toISOString();
}

export function getDraftItemQuestion(draft: WhatsappDraftState, products: DraftProduct[]) {
  for (const raw of draft.items) {
    const item = raw as { productId?: string; quantity?: number; requestedUnits?: number; selectedItems?: unknown };
    const product = products.find((entry) => entry.id === item?.productId);
    if (!product) return "Esse produto não está disponível. Qual outro produto você gostaria de pedir?";
    if (!item.quantity || (product.allowsMultiple && !item.requestedUnits)) return `Qual quantidade de ${product.nome} você quer?${product.allowsMultiple ? ` O mínimo é ${product.minQuantity} unidades.` : ""}`;
    try {
      validateCartItemQuantities({ product: { ...product, productType: product }, audience: "VIZINHA", ...item, quantity: item.quantity, selectedItems: item.selectedItems });
    } catch (error) {
      const options = product.precisaSelecaoDeTipos ? `\nOpções de ${product.nome}: ${product.saboresSugeridos.join(", ")}.` : "";
      const lot = product.allowsMultiple && product.minQuantity ? product.minQuantity : product.totalUnidades;
      const maxTypes = product.maxTiposSalgado * (product.allowsMultiple ? Math.max(1, Math.floor(Number(item.requestedUnits) / lot)) : item.quantity);
      return `${error instanceof Error ? error.message : "Vamos ajustar a quantidade."}${options}${product.precisaSelecaoDeTipos ? `\nComo você quer dividir as quantidades? Pode escolher até ${maxTypes} tipos.` : ""}`;
    }
  }
  return null;
}

export function getMissingDraftField(draft: WhatsappDraftState, products?: DraftProduct[]) {
  if (!Array.isArray(draft.items) || draft.items.length === 0) return "items";
  if (products && getDraftItemQuestion(draft, products)) return "itemSelection";
  if (!draft.scheduledAt) return "scheduledAt";
  if (!draft.customerName) return "customerName";
  if (!draft.customerEmail) return "customerEmail";
  if (!draft.phone || draft.phone.replace(/\D/g, "").length < 10) return "phone";
  if (!draft.fulfillmentType) return "fulfillmentType";
  if (draft.fulfillmentType === "DELIVERY" && !draft.deliveryStreet) return "deliveryStreet";
  if (draft.fulfillmentType === "DELIVERY" && !draft.deliveryNumber) return "deliveryNumber";
  if (draft.fulfillmentType === "DELIVERY" && !draft.deliveryNeighborhood) return "deliveryNeighborhood";
  if (draft.fulfillmentType === "DELIVERY" && !draft.deliveryReference) return "deliveryReference";
  if (!draft.paymentMethod) return "paymentMethod";
  if (!draft.paymentPercentage) return "paymentPercentage";
  return null;
}

export function getNextDraftQuestion(draft: WhatsappDraftState, products?: DraftProduct[]) {
  switch (getMissingDraftField(draft, products)) {
    case "itemSelection": return getDraftItemQuestion(draft, products!)!;
    case "items": return "O que você gostaria de pedir e em qual quantidade?";
    case "fulfillmentType": return "Você prefere entrega ou retirada na loja?";
    case "deliveryStreet":
    case "deliveryNumber":
    case "deliveryNeighborhood":
    case "deliveryReference": return `Me passa ${[["deliveryStreet", "a rua"], ["deliveryNumber", "o número"], ["deliveryNeighborhood", "o bairro"], ["deliveryReference", "um ponto de referência (ou diga que não tem)"]].filter(([key]) => !draft[key as keyof WhatsappDraftState]).map(([, label]) => label).join(", ")} para a entrega?`;
    case "scheduledAt": return "Para qual dia e horário você quer o pedido?";
    case "customerName":
    case "customerEmail":
    case "phone": return `Para deixar o pedido no seu nome, me passa ${[!draft.customerName && "seu nome", !draft.customerEmail && "e-mail", (!draft.phone || draft.phone.replace(/\D/g, "").length < 10) && "número com DDD"].filter(Boolean).join(" e ")}?${draft.phone ? ` Vou usar o WhatsApp ${draft.phone} como contato; pode informar outro se preferir.` : ""}`;
    case "paymentMethod": return draft.paymentPercentage === 100
      ? "O pagamento será integral. Vai pagar com Pix, cartão de crédito ou débito?"
      : draft.paymentPercentage === 50
        ? "Você escolheu pagar 50% agora. Vai pagar com Pix, cartão de crédito ou débito?"
        : "Vai pagar com Pix, cartão de crédito ou débito? E prefere pagar 50% agora ou o valor total?";
    case "paymentPercentage": return "Você prefere pagar 50% agora ou o valor total?";
    default: return "Vou conferir os valores e mostrar o resumo do seu pedido.";
  }
}
