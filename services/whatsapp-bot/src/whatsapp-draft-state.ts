type WhatsappDraftState = {
  items: unknown[]; fulfillmentType: string | null; scheduledAt: string | null;
  deliveryStreet: string | null; deliveryNumber: string | null;
  deliveryNeighborhood: string | null; deliveryReference: string | null;
  customerName: string | null; customerEmail: string | null;
  paymentMethod: string | null; paymentPercentage: number | null;
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
  const iso = new Date(raw);
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && !Number.isNaN(iso.getTime())) return iso.toISOString();
  const text = simplify(raw);
  const time = text.match(/\b(?:as|a|para)\s*(\d{1,2})(?:[:h](\d{2}))?\s*(?:h|hrs|horas)?\b/)
    || text.match(/\b(\d{1,2})(?:[:h](\d{2}))\s*(?:h|hrs|horas)?\b/);
  const day = text.match(/\bdia\s+(\d{1,2})(?:\s*(?:\/|de)\s*(\d{1,2}))?/);
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

export function getMissingDraftField(draft: WhatsappDraftState) {
  if (!Array.isArray(draft.items) || draft.items.length === 0) return "items";
  if (!draft.fulfillmentType) return "fulfillmentType";
  if (draft.fulfillmentType === "DELIVERY" && !draft.deliveryStreet) return "deliveryStreet";
  if (draft.fulfillmentType === "DELIVERY" && !draft.deliveryNumber) return "deliveryNumber";
  if (draft.fulfillmentType === "DELIVERY" && !draft.deliveryNeighborhood) return "deliveryNeighborhood";
  if (draft.fulfillmentType === "DELIVERY" && !draft.deliveryReference) return "deliveryReference";
  if (!draft.scheduledAt) return "scheduledAt";
  if (!draft.customerName) return "customerName";
  if (!draft.customerEmail) return "customerEmail";
  if (!draft.paymentMethod) return "paymentMethod";
  if (!draft.paymentPercentage) return "paymentPercentage";
  return null;
}

export function getNextDraftQuestion(draft: WhatsappDraftState) {
  switch (getMissingDraftField(draft)) {
    case "items": return "O que você gostaria de pedir e em qual quantidade?";
    case "fulfillmentType": return "Você prefere entrega ou retirada na loja?";
    case "deliveryStreet": return "Qual é a rua da entrega?";
    case "deliveryNumber": return "Qual é o número do endereço?";
    case "deliveryNeighborhood": return "Qual é o bairro da entrega?";
    case "deliveryReference": return "Qual é o ponto de referência da entrega?";
    case "scheduledAt": return "Para qual dia e horário você quer o pedido?";
    case "customerName": return "Qual é o nome de quem vai retirar ou receber o pedido?";
    case "customerEmail": return "Qual e-mail devemos usar no pagamento?";
    case "paymentMethod": return "Qual será a forma de pagamento: Pix, cartão de crédito ou débito?";
    case "paymentPercentage": return "Você prefere pagar 50% agora ou o valor total?";
    default: return "Já tenho todos os dados. Posso mostrar o resumo completo para você confirmar?";
  }
}
