import { stripAccents } from "./name-matching.js";

export type PaymentChoice = { percentual?: 50 | 100; forma?: "pix" | "cartao_credito" | "cartao_debito" };

const norm = (value: string) => stripAccents(value).toLowerCase();

/**
 * Lê "50", "50%", "metade", "100%", "total", "pix", "crédito", "no débito"... da mensagem do cliente.
 * Só deve ser usado quando o pedido já está completo e falta apenas o pagamento (aí "50" não é quantidade).
 * Não adivinha: se a mensagem trouxer duas opções diferentes, ignora aquele campo; "cartão" sozinho
 * é ambíguo (crédito ou débito) e fica para o modelo perguntar.
 */
export function extractPayment(message: string): PaymentChoice {
  const text = norm(message);
  const choice: PaymentChoice = {};

  const wantsHalf = /(^|\D)50\s*(%|por\s*cento)?(?!\d)|\bmetade\b|\bmeio a meio\b/.test(text);
  const wantsFull = /(^|\D)100\s*(%|por\s*cento)?(?!\d)|\btotal\b|\btudo\b|\bintegral\b|\binteiro\b|\ba vista\b|\bcompleto\b/.test(text);
  if (wantsHalf !== wantsFull) choice.percentual = wantsHalf ? 50 : 100;

  const methods = new Set<NonNullable<PaymentChoice["forma"]>>();
  if (/\bpix\b/.test(text)) methods.add("pix");
  if (/\bdeb\w*/.test(text)) methods.add("cartao_debito");
  if (/\bcred\w*/.test(text)) methods.add("cartao_credito");
  if (methods.size === 1) choice.forma = [...methods][0];

  return choice;
}
