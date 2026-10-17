import { BUSINESS_INFO } from "@/lib/site-config";

/**
 * Liga/desliga o atendimento por WhatsApp no site (botão do topo e faixa "Prefere conversar?").
 * Para tirar do site, troque para `false`.
 */
export const SHOW_WHATSAPP_ORDER = true;

/** Número do WhatsApp da loja só com dígitos e DDI (55). */
export function getWhatsAppNumber(phone: string = BUSINESS_INFO.supportPhone) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

/** Link que abre a conversa com a loja já com uma mensagem pronta. */
export function getWhatsAppOrderUrl(message = "Olá! Quero fazer uma encomenda.") {
  return `https://wa.me/${getWhatsAppNumber()}?text=${encodeURIComponent(message)}`;
}

/** Endereço de retirada vindo do ambiente (PICKUP_ADDRESS / PICKUP_REFERENCE). */
export function getPickupInfo() {
  const address = process.env.PICKUP_ADDRESS?.trim();
  if (!address) return null;
  const reference = process.env.PICKUP_REFERENCE?.trim() || null;
  return {
    address,
    reference,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
  };
}
