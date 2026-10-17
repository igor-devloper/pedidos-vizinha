import type { AgentContent } from "./agent-loop.js";

const wordSet = (text: string) =>
  new Set(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((word) => word.length > 2));

export function similarity(a: string, b: string) {
  const left = wordSet(a);
  const right = wordSet(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** As três últimas falas do bot são quase iguais? Sinal de que o modelo está copiando o próprio histórico. */
export function isRepeatingItself(history: AgentContent[]) {
  const botTexts = history
    .filter((content) => content.role === "model")
    .map((content) => content.parts.map((part) => (typeof part.text === "string" ? part.text : "")).join(" "))
    .slice(-3);
  return botTexts.length === 3 && similarity(botTexts[2], botTexts[1]) >= 0.5 && similarity(botTexts[1], botTexts[0]) >= 0.5;
}
