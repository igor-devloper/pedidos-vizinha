// Trava de segurança contra "invenção" do modelo: valores em reais que o cliente lê só podem ter
// vindo do cardápio ou de uma ferramenta. Se a resposta cita um valor desconhecido, ela não é enviada.

import type { AgentProduct } from "./cart.js";
import { finalUnitPrice } from "./cart.js";

const MONEY = /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/gi;

function toNumber(raw: string) {
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

/** Todos os valores "R$ ..." escritos em um texto. */
export function extractMoney(text: string) {
  const values: number[] = [];
  for (const match of text.matchAll(MONEY)) {
    const value = toNumber(match[1]);
    if (Number.isFinite(value)) values.push(Number(value.toFixed(2)));
  }
  return values;
}

/** Valores permitidos de largada: preços atuais e originais do cardápio. */
export function catalogMoney(products: AgentProduct[]) {
  const allowed = new Set<number>();
  for (const product of products) {
    allowed.add(Number(Number(product.preco).toFixed(2)));
    allowed.add(finalUnitPrice(product));
  }
  return allowed;
}

const MONEY_KEY = /(numero|valor|preco|taxa|fee|total|subtotal)/i;

/** Junta ao conjunto os valores que uma ferramenta devolveu (textos "R$ 85,00" e campos numéricos de dinheiro). */
export function addMoneyFromToolResult(allowed: Set<number>, value: unknown, key = "") {
  if (typeof value === "string") {
    for (const amount of extractMoney(value)) allowed.add(amount);
  } else if (typeof value === "number") {
    if (MONEY_KEY.test(key) && Number.isFinite(value)) allowed.add(Number(value.toFixed(2)));
  } else if (Array.isArray(value)) {
    for (const item of value) addMoneyFromToolResult(allowed, item, key);
  } else if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) addMoneyFromToolResult(allowed, child, childKey);
  }
}

/** Valores citados na resposta que não vieram do cardápio nem de nenhuma ferramenta. */
export function findUnverifiedMoney(reply: string, allowed: Set<number>) {
  return [...new Set(extractMoney(reply))].filter((amount) => !allowed.has(amount));
}

const format = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Mensagem de correção devolvida ao modelo quando ele cita valores sem fonte. */
export function buildCorrectionNotice(unverified: number[]) {
  return [
    `[Aviso do sistema] Sua resposta citou valores que não vieram das ferramentas (${unverified.map(format).join(", ")}).`,
    "Você NÃO pode escrever cardápio, produtos, sabores ou preços por conta própria.",
    "Para mostrar o cardápio use enviar_cardapio; para responder sobre preços e regras consulte ver_cardapio e use só o que ela devolver.",
    "Reescreva a resposta agora, sem inventar nada.",
  ].join(" ");
}

/** No primeiro contato o cardápio é sempre enviado pelo código, mesmo que o modelo esqueça de pedir. */
export function needsMenuAfterReply(firstContact: boolean, toolNames: string[]) {
  return firstContact && !toolNames.includes("enviar_cardapio");
}
