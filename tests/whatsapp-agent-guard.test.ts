import assert from "node:assert/strict";
import test from "node:test";

import { runAgentLoop, type ModelClient, type ModelTurn } from "../services/whatsapp-bot/src/agent/agent-loop.js";
import type { AgentProduct } from "../services/whatsapp-bot/src/agent/cart.js";
import {
  addMoneyFromToolResult,
  buildCorrectionNotice,
  catalogMoney,
  extractMoney,
  findUnverifiedMoney,
  needsMenuAfterReply,
} from "../services/whatsapp-bot/src/agent/guard.js";
import { executeTool, type ToolDeps } from "../services/whatsapp-bot/src/agent/tools.js";

function product(overrides: Partial<AgentProduct>): AgentProduct {
  return {
    id: "p", nome: "Produto", descricao: "", preco: "0", descontoPercentual: "0", categoria: "CENTO",
    emPromocao: false, totalUnidades: 100, maxTiposSalgado: 4, permitePagamentoParcial: true,
    saboresSugeridos: ["Coxinha"], comboItens: [], antecedenciaMinimaHoras: null, precisaSelecaoDeTipos: true,
    minQuantity: 100, allowsMultiple: true, ...overrides,
  };
}

const cento = product({ id: "cento", nome: "Cento Tradicional", preco: "90", emPromocao: true, descontoPercentual: "5.56" });
const porcao = product({ id: "porcao", nome: "Porção", preco: "25", totalUnidades: 30, minQuantity: 30 });

// A mensagem real que a cliente recebeu: itens e preços inventados pelo modelo.
const INVENTED_MENU = `Salgados (cento)
Coxinha de frango: R$ 80,00
Kibe: R$ 75,00
Bolinha de queijo: R$ 90,00
Mini pizza (cento): Calabresa R$ 95,00`;

test("lê valores em reais em vários formatos", () => {
  assert.deepEqual(extractMoney("De R$ 90,00 por R$85 e R$ 1.250,50 no total, sem R$ extra"), [90, 85, 1250.5]);
  assert.deepEqual(extractMoney("Sem preço aqui"), []);
});

test("o cardápio inventado é detectado: valores que não existem no cadastro", () => {
  const allowed = catalogMoney([cento, porcao]);
  assert.ok(allowed.has(85) && allowed.has(90) && allowed.has(25));
  assert.deepEqual(findUnverifiedMoney(INVENTED_MENU, allowed), [80, 75, 95]);
  assert.match(buildCorrectionNotice([80, 75]), /NÃO pode escrever cardápio/);
});

test("valores reais do cadastro e das ferramentas passam", () => {
  const allowed = catalogMoney([cento, porcao]);
  assert.deepEqual(findUnverifiedMoney("O Cento Tradicional está R$ 85,00 (de R$ 90,00) e a Porção, R$ 25,00.", allowed), []);

  addMoneyFromToolResult(allowed, { ok: true, totalDosProdutos: "R$ 127,50", itens: [{ subtotal: "R$ 127,50", subtotalNumero: 127.5 }], taxaDeEntrega: "R$ 8,00" });
  assert.deepEqual(findUnverifiedMoney("Fica R$ 127,50 com entrega de R$ 8,00.", allowed), []);
  assert.deepEqual(findUnverifiedMoney("Fica R$ 130,00.", allowed), [130]);
});

test("números que não são dinheiro (unidades, quantidades) não entram na lista permitida", () => {
  const allowed = new Set<number>();
  addMoneyFromToolResult(allowed, { unidades: 100, faltamUnidades: 60, limiteDeSabores: 4 });
  assert.equal(allowed.size, 0);
});

test("o laço devolve o aviso ao modelo e só envia a resposta corrigida", async () => {
  const allowed = catalogMoney([cento]);
  const turns: Array<Partial<ModelTurn>> = [
    { text: INVENTED_MENU },
    { text: "O Cento Tradicional custa R$ 85,00. Quer ver o cardápio completo?" },
  ];
  const seen: string[] = [];
  let index = 0;
  const model: ModelClient = {
    async generate(contents) {
      seen.push(JSON.stringify(contents.at(-1)));
      const turn = turns[index++];
      return { text: turn.text ?? "", functionCalls: [], modelContent: { role: "model", parts: [{ text: turn.text ?? "" }] } };
    },
  };

  const result = await runAgentLoop({
    model,
    history: [{ role: "user", parts: [{ text: "oi" }] }],
    runTool: async () => ({ ok: true }),
    verifyReply: (reply) => {
      const bad = findUnverifiedMoney(reply, allowed);
      return bad.length ? buildCorrectionNotice(bad) : null;
    },
  });

  assert.equal(result.blocked, false);
  assert.match(result.reply, /R\$ 85,00/);
  assert.doesNotMatch(result.reply, /Kibe/);
  assert.match(seen[1], /Aviso do sistema/);
});

test("se o modelo insiste em inventar, a resposta é barrada (nada é enviado)", async () => {
  const allowed = catalogMoney([cento]);
  const model: ModelClient = {
    async generate() {
      return { text: INVENTED_MENU, functionCalls: [], modelContent: { role: "model", parts: [{ text: INVENTED_MENU }] } };
    },
  };
  const result = await runAgentLoop({
    model,
    history: [],
    runTool: async () => ({}),
    verifyReply: (reply) => (findUnverifiedMoney(reply, allowed).length ? "corrija" : null),
    maxCorrections: 2,
  });
  assert.equal(result.blocked, true);
  assert.equal(result.reply, "");
});

test("primeiro contato: o código garante o cardápio mesmo que o modelo não peça", () => {
  assert.equal(needsMenuAfterReply(true, ["ver_horarios"]), true);
  assert.equal(needsMenuAfterReply(true, ["enviar_cardapio"]), false);
  assert.equal(needsMenuAfterReply(false, []), false);
});

test("enviar_cardapio entrega o cardápio depois da resposta do modelo, com os dados do cadastro", async () => {
  const sent: string[] = [];
  const later: string[] = [];
  const deps = {
    products: [cento, porcao],
    send: async (text: string) => void sent.push(text),
    sendAfterReply: (text: string) => void later.push(text),
    business: { name: "Vizinha Salgateria", cardapioUrl: "https://x/cardapio", pickupAddress: "" },
  } as unknown as ToolDeps;

  const result = await executeTool("enviar_cardapio", {}, deps);
  assert.equal(result.ok, true);
  assert.equal(sent.length, 0, "nada sai antes da resposta do modelo");
  assert.equal(later.length, 1);
  assert.match(later[0], /Cento Tradicional/);
  assert.doesNotMatch(later[0], /Kibe|Mini pizza|Brigadeiro/);
});
