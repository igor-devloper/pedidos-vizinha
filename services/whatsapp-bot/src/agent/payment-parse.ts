import { stripAccents } from "./name-matching.js";

export type PaymentChoice = { percentual?: 50 | 100; forma?: "pix" | "cartao_credito" | "cartao_debito" };

const norm = (value: string) => stripAccents(value).toLowerCase();

/**
 * Lê "50%", "50 no crédito", "metade", "100%", "pix", "no débito"... da mensagem do cliente.
 * Não adivinha: números soltos ("100 coxinhas") e palavras como "total" só valem quando a frase fala de
 * pagamento; se a mensagem trouxer duas opções diferentes, ignora aquele campo; "cartão" sozinho é
 * ambíguo (crédito ou débito) e fica para o modelo perguntar.
 */
export function extractPayment(message: string): PaymentChoice {
  const text = norm(message);
  const choice: PaymentChoice = {};

  const methods = new Set<NonNullable<PaymentChoice["forma"]>>();
  if (/\bpix\b/.test(text)) methods.add("pix");
  if (/\bdeb\w*/.test(text)) methods.add("cartao_debito");
  if (/\bcred\w*/.test(text)) methods.add("cartao_credito");
  if (methods.size === 1) choice.forma = [...methods][0];

  const paymentTalk = /\b(pix|cred\w*|deb\w*|cartao|pag\w*)\b/.test(text);
  const onlyNumber = /^\s*(50|100)\s*[.!]?\s*$/.test(text);

  const explicitHalf = /(^|\D)50\s*(%|por\s*cento)/.test(text);
  const explicitFull = /(^|\D)100\s*(%|por\s*cento)/.test(text);
  const bareHalf = (paymentTalk || onlyNumber) && /(^|\D)50(?![\d%])/.test(text);
  const bareFull = (paymentTalk || onlyNumber) && /(^|\D)100(?![\d%])/.test(text);
  const wordHalf = (paymentTalk || /\bagora\b/.test(text)) && /\bmetade\b|\bmeio a meio\b/.test(text);
  const wordFull = (paymentTalk || /\bagora\b/.test(text)) && /\btotal\b|\btudo\b|\bintegral\b|\binteiro\b|\ba vista\b|\bcompleto\b/.test(text);

  const wantsHalf = explicitHalf || bareHalf || wordHalf;
  const wantsFull = explicitFull || bareFull || wordFull;
  if (wantsHalf !== wantsFull) choice.percentual = wantsHalf ? 50 : 100;

  return choice;
}
