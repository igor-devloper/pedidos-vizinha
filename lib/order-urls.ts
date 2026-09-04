import { BUSINESS_INFO } from "@/lib/site-config";

const base = () => BUSINESS_INFO.appUrl.replace(/\/$/, "");
export const getOrderCheckoutUrl = (orderId: string) => `${base()}/checkout/order/${encodeURIComponent(orderId)}`;
export const getOrderBalanceUrl = (orderId: string) => `${base()}/checkout/saldo/${encodeURIComponent(orderId)}`;
export const getOrderReturnUrl = (externalReference: string) => `${base()}/pedido/confirmacao?ref=${encodeURIComponent(externalReference)}`;
export const getMercadoPagoWebhookUrl = () => process.env.MP_WEBHOOK_URL?.trim() || `${base()}/api/mercadopago/webhook`;
