import type { WhatsappDraft } from "../whatsapp-draft-repository.js";
import { describeCart, type AgentProduct, type CartLine } from "./cart.js";

export type DraftState = Pick<
  WhatsappDraft,
  | "id"
  | "phone"
  | "customerName"
  | "customerEmail"
  | "stage"
  | "status"
  | "fulfillmentType"
  | "scheduledAt"
  | "deliveryStreet"
  | "deliveryNumber"
  | "deliveryNeighborhood"
  | "deliveryReference"
  | "paymentMethod"
  | "paymentPercentage"
  | "items"
  | "orderId"
  | "summarySentAt"
  | "lastCustomerMessageAt"
>;

export function parseLines(draft: Pick<DraftState, "items">): CartLine[] {
  if (!Array.isArray(draft.items)) return [];
  return draft.items.flatMap((raw) => {
    const item = raw as Partial<CartLine> | null;
    if (!item || typeof item.productId !== "string") return [];
    const selectedItems = Array.isArray(item.selectedItems)
      ? item.selectedItems.flatMap((entry) =>
          entry && typeof entry.tipo === "string" && Number(entry.quantidade) > 0
            ? [{ tipo: entry.tipo, quantidade: Number(entry.quantidade) }]
            : [],
        )
      : [];
    return [{
      productId: item.productId,
      quantity: Number(item.quantity) || 1,
      requestedUnits: Number(item.requestedUnits) || 0,
      selectedItems,
    }];
  });
}

/** O que ainda falta para fechar o pedido, na ordem natural da conversa. */
export function missingFields(draft: DraftState, products: AgentProduct[]) {
  const missing: string[] = [];
  const lines = parseLines(draft);
  const cart = describeCart(products, lines);

  if (lines.length === 0) missing.push("itens do pedido");
  else if (!cart.todosCompletos) missing.push("sabores e quantidades dos itens");
  if (!draft.customerName?.trim()) missing.push("nome do cliente");
  if (!draft.fulfillmentType) missing.push("entrega ou retirada");
  if (draft.fulfillmentType === "DELIVERY") {
    if (!draft.deliveryStreet) missing.push("rua da entrega");
    if (!draft.deliveryNumber) missing.push("número da casa");
    if (!draft.deliveryNeighborhood) missing.push("bairro");
  }
  if (!draft.scheduledAt) missing.push("data e horário");
  if (!draft.paymentPercentage) missing.push("pagar 50% ou 100%");
  if (!draft.paymentMethod) missing.push("forma de pagamento (Pix ou cartão)");
  return missing;
}

const PAYMENT_LABELS: Record<string, string> = {
  PIX: "Pix",
  CARTAO_CREDITO: "cartão de crédito",
  CARTAO_DEBITO: "cartão de débito",
};

export function formatScheduledAt(value: string | Date | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Retrato do pedido em andamento: vai para o modelo a cada mensagem e para a ferramenta ver_carrinho. */
export function describeDraft(draft: DraftState, products: AgentProduct[]) {
  const cart = describeCart(products, parseLines(draft));
  return {
    itens: cart.itens,
    totalDosProdutos: cart.totalDosProdutos,
    nome: draft.customerName || null,
    telefoneDeContato: draft.phone || null,
    modalidade: draft.fulfillmentType === "DELIVERY" ? "entrega" : draft.fulfillmentType === "PICKUP" ? "retirada" : null,
    enderecoDeEntrega: draft.fulfillmentType === "DELIVERY"
      ? [draft.deliveryStreet, draft.deliveryNumber, draft.deliveryNeighborhood, draft.deliveryReference].filter(Boolean).join(", ") || null
      : null,
    dataEHora: formatScheduledAt(draft.scheduledAt),
    pagamento: draft.paymentPercentage || draft.paymentMethod
      ? `${draft.paymentPercentage ?? "?"}% via ${PAYMENT_LABELS[String(draft.paymentMethod)] ?? "forma não escolhida"}`
      : null,
    etapa: draft.stage,
    pedidoJaCriado: Boolean(draft.orderId),
    faltaPreencher: missingFields(draft, products),
  };
}
