import assert from "node:assert/strict";
import test from "node:test";

import type { AgentContent } from "../services/whatsapp-bot/src/agent/agent-loop.js";
import { isRepeatingItself } from "../services/whatsapp-bot/src/agent/repetition.js";

const model = (text: string): AgentContent => ({ role: "model", parts: [{ text }] });
const user = (text: string): AgentContent => ({ role: "user", parts: [{ text }] });

test("detecta o bot repetindo a mesma pergunta de pagamento", () => {
  const history = [
    model("Massa! Tudo certinho então! Agora, pra fechar o pedido, como você quer pagar? Pode ser 50% agora e o resto na entrega, ou 100% agora? Pix, cartão de crédito ou débito?"),
    user("50 no crédito"),
    model("Massa! Tudo ok então! Agora, pra finalizar o pedido, como você quer pagar? Pode ser 50% agora ou 100% de uma vez? E qual a forma: Pix, cartão de crédito ou débito?"),
    user("50%"),
    model("Massa! Tudo certo então! Agora, pra fechar o pedido, como você quer pagar? Pode ser 50% ou 100% agora. E a forma: Pix, cartão de crédito ou cartão de débito?"),
    user("50% no crédito"),
  ];
  assert.equal(isRepeatingItself(history), true);
});

test("conversa normal não é considerada repetição", () => {
  const history = [
    model("Oi! Bem-vindo à Vizinha Salgateria. O cardápio vem logo abaixo."),
    user("quero 100 coxinhas"),
    model("Anotei 100 coxinhas. Qual o seu nome?"),
    user("Maria"),
    model("Prazer, Maria! É para entrega ou retirada?"),
  ];
  assert.equal(isRepeatingItself(history), false);
});
