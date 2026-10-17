import { BUSINESS_INFO } from "@/lib/site-config";

/** Número do WhatsApp da loja só com dígitos e DDI (55). */
export function getWhatsAppNumber(phone: string = BUSINESS_INFO.supportPhone) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

/** Link que abre a conversa com a loja já com uma mensagem pronta. */
export function getWhatsAppOrderUrl(message = "Olá! Quero fazer um pedido.") {
  return `https://wa.me/${getWhatsAppNumber()}?text=${encodeURIComponent(message)}`;
}
