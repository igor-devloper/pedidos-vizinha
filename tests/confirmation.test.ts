import assert from "node:assert/strict";
import test from "node:test";

import { isClearConfirmation } from "../services/whatsapp-bot/src/agent/tools.js";

test("reconhece confirmações do jeito que o cliente fala", () => {
  for (const text of ["sim", "Sim!", "Show tudo certo", "show", "pode confirmar", "tudo certo", "Beleza, pode gerar", "top", "ok", "Pode fechar", "isso mesmo", "tente novamente"]) {
    assert.equal(isClearConfirmation(text), true, text);
  }
});

test("não confirma quando há dúvida ou pedido de mudança", () => {
  for (const text of ["não", "sim mas troca o horário", "espera", "quero mudar o endereço", "cancela", "quanto fica?", "show de bola, mas errado"]) {
    assert.equal(isClearConfirmation(text), false, text);
  }
});
