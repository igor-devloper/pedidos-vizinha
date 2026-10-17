import assert from "node:assert/strict";
import test from "node:test";

import { DELIVERY_FEES } from "../lib/delivery";
import { buildStoreInfo, checkSchedule, describeWeeklyHours } from "../lib/whatsapp-schedule";
import { type AgentProduct } from "../services/whatsapp-bot/src/agent/cart.js";
import type { SiteApi } from "../services/whatsapp-bot/src/agent/site-api.js";
import type { DraftState } from "../services/whatsapp-bot/src/agent/state.js";
import { buildMenuMessage, executeTool, isClearConfirmation, type ToolDeps } from "../services/whatsapp-bot/src/agent/tools.js";

const FLAVORS = ["Pastel frito", "Pastel frito açucarado", "Bolinha de queijo", "Risole misto", "Coxinha", "Churros"];
// Sexta-feira, 16/10/2026, 09:00 em Recife.
const NOW = new Date("2026-10-16T09:00:00-03:00");

function product(overrides: Partial<AgentProduct>): AgentProduct {
  return {
    id: "p", nome: "Produto", descricao: "", preco: "0", descontoPercentual: "0", categoria: "CENTO",
    emPromocao: false, totalUnidades: 100, maxTiposSalgado: 4, permitePagamentoParcial: true,
    saboresSugeridos: FLAVORS, comboItens: [], antecedenciaMinimaHoras: null, precisaSelecaoDeTipos: true,
    minQuantity: 100, allowsMultiple: true, ...overrides,
  };
}

const cento = product({ id: "cento", nome: "Cento Tradicional", preco: "90", emPromocao: true, descontoPercentual: "5.56" });
const meio = product({ id: "meio", nome: "Meio cento", preco: "45", totalUnidades: 50, minQuantity: 50, maxTiposSalgado: 2 });
const integral = product({ id: "integral", nome: "Torta", preco: "60", permitePagamentoParcial: false, totalUnidades: 1, minQuantity: null, allowsMultiple: false, precisaSelecaoDeTipos: false });

function harness(overrides: { products?: AgentProduct[]; draft?: Partial<DraftState>; customerText?: string; now?: Date; closedByOwner?: boolean } = {}) {
  const clock = overrides.now ?? NOW;
  const sent: string[] = [];
  const owner: string[] = [];
  const handoffs: string[] = [];
  const orderCalls: boolean[] = [];
  let draft: DraftState = {
    id: "d1", phone: "5583999990000", customerName: null, customerEmail: null, stage: "COLLECTING", status: "ACTIVE",
    fulfillmentType: null, scheduledAt: null, deliveryStreet: null, deliveryNumber: null, deliveryNeighborhood: null,
    deliveryReference: null, paymentMethod: null, paymentPercentage: null, items: [], orderId: null,
    summarySentAt: null, lastCustomerMessageAt: null, ...overrides.draft,
  };
  let customerText = overrides.customerText ?? "";

  const api: SiteApi = {
    async storeInfo() {
      const base = buildStoreInfo({ now: clock, storeOpenManually: !overrides.closedByOwner });
      return {
        ...base,
        allowMultipleOrdersPerSlot: false,
        weekly: describeWeeklyHours(),
        deliveryFees: DELIVERY_FEES.map(({ label, fee, neighborhoods }) => ({ area: label, fee, neighborhoods: [...neighborhoods] })),
      };
    },
    async checkSchedule(iso) {
      const result = checkSchedule(new Date(iso), { now: clock, storeOpenManually: !overrides.closedByOwner });
      return result.ok ? { ok: true } : { ok: false, reason: result.reason, suggestions: result.suggestions };
    },
    async requestOrder(_id, preview) {
      orderCalls.push(preview);
      return preview
        ? { ok: true, status: 200, data: { summary: "*Resumo do pedido*\nTotal: R$ 85,00\nPode confirmar?" } }
        : { ok: true, status: 200, data: { order: { id: "order-1", code: "C123", chargedAmount: "42.50" }, pixCopyPaste: "00020126PIX" } };
    },
  };

  const deps: ToolDeps = {
    products: overrides.products ?? [cento, meio],
    getDraft: () => draft,
    async patchDraft(patch) { draft = { ...draft, ...patch } as DraftState; return draft; },
    async resetDraft() { draft = { ...draft, items: [], orderId: null, stage: "COLLECTING", summarySentAt: null, customerName: null, fulfillmentType: null, scheduledAt: null, paymentMethod: null, paymentPercentage: null }; return draft; },
    api,
    async send(text) { sent.push(text); },
    async notifyOwner(text) { owner.push(text); },
    async handoff(reason) { handoffs.push(reason); },
    lastCustomerText: () => customerText,
    now: () => clock,
    business: { name: "Vizinha Salgateria", cardapioUrl: "https://www.vizinhasalgateria.site/cardapio", pickupAddress: "Rua A, 1", pickupReference: "Perto do mercadinho" },
  };

  return {
    deps, sent, owner, handoffs, orderCalls,
    get draft() { return draft; },
    say(text: string) { customerText = text; draft = { ...draft, lastCustomerMessageAt: new Date(NOW.getTime() + 1000 * (sent.length + 5)).toISOString() }; },
    run: (name: string, args: Record<string, unknown> = {}) => executeTool(name, args, deps),
  };
}

async function fillOrder(h: ReturnType<typeof harness>) {
  assert.equal((await h.run("adicionar_item", { produto: "cento", quantidade: 1, quantidade_em: "lotes", sabores: [{ sabor: "coxinha", quantidade: 50 }, { sabor: "bolinha", quantidade: 50 }] })).ok, true);
  assert.equal((await h.run("definir_cliente", { nome: "Maria" })).ok, true);
  assert.equal((await h.run("definir_entrega", { tipo: "retirada" })).ok, true);
  assert.equal((await h.run("verificar_data_hora", { dia_da_semana: "sábado", hora: "15h" })).ok, true);
  assert.equal((await h.run("definir_pagamento", { percentual: 50, forma: "pix" })).ok, true);
}

test("fluxo completo: o pedido só é criado depois do resumo e de um 'sim' posterior", async () => {
  const h = harness();
  await fillOrder(h);
  assert.deepEqual((await h.run("ver_carrinho")).faltaPreencher, []);

  const summary = await h.run("ver_resumo");
  assert.equal(summary.ok, true);
  assert.equal(h.sent.length, 1);
  assert.equal(h.draft.stage, "AWAITING_CONFIRMATION");

  // O modelo tenta finalizar na mesma vez, sem resposta do cliente: bloqueado.
  const early = await h.run("finalizar_pedido");
  assert.equal(early.ok, false);
  assert.deepEqual(h.orderCalls, [true]);

  h.say("sim, pode confirmar");
  const done = await h.run("finalizar_pedido");
  assert.equal(done.ok, true);
  assert.equal(done.numeroDoPedido, "C123");
  assert.deepEqual(h.orderCalls, [true, false]);
  assert.match(h.sent.join("\n"), /#C123/);
  assert.equal(h.sent.at(-1), "00020126PIX");
  assert.match(h.owner[0], /Novo pedido pelo WhatsApp #C123/);
  assert.match(h.owner[0], /Maria/);
});

test("não finaliza sem resumo, com resposta ambígua, ou se o pedido mudou depois do resumo", async () => {
  const h = harness();
  await fillOrder(h);
  h.say("sim");
  assert.equal((await h.run("finalizar_pedido")).ok, false, "sem resumo");

  await h.run("ver_resumo");
  h.say("não, espera, quero trocar");
  assert.equal((await h.run("finalizar_pedido")).ok, false, "resposta negativa");

  h.say("sim");
  await h.run("definir_cliente", { nome: "Maria José" }); // mudou depois do resumo
  assert.equal((await h.run("finalizar_pedido")).ok, false, "pedido alterado volta a exigir resumo");
  assert.deepEqual(h.orderCalls, [true]);
});

test("confirmação clara vs. hesitação", () => {
  for (const yes of ["sim", "Sim!", "pode sim 😊", "confirmo", "isso mesmo", "ok", "tudo certo", "tente novamente"]) {
    assert.equal(isClearConfirmation(yes), true, yes);
  }
  for (const no of ["não", "sim mas muda o horário", "espera", "quero trocar o sabor", "depois eu falo", "qual o total?"]) {
    assert.equal(isClearConfirmation(no), false, no);
  }
});

test("manda domingo 15h: a loja fecha às 13h, a ferramenta explica e oferece horários", async () => {
  const h = harness();
  const result = await h.run("verificar_data_hora", { dia_da_semana: "domingo", hora: "15h" });
  assert.equal(result.ok, false);
  assert.match(String(result.erro), /9h às 13h/);
  assert.ok((result.sugestoes as string[]).length > 0);
  assert.equal(h.draft.scheduledAt, null);
});

test("segunda de manhã: fechado, sugere terça", async () => {
  const h = harness();
  const result = await h.run("verificar_data_hora", { dia_da_semana: "segunda", periodo: "manha" });
  assert.equal(result.ok, false);
  assert.match(String(result.erro), /Não atendemos/);
  assert.match((result.sugestoes as string[])[0], /terça-feira, 20\/10\/2026, das 10h às 17h/);
});

test("sábado à tarde: devolve a janela 13h–17h para perguntar o horário", async () => {
  const h = harness();
  const result = await h.run("verificar_data_hora", { dia_da_semana: "sábado", periodo: "tarde" });
  assert.equal(result.ok, true);
  assert.equal(result.janelaDisponivel, "das 13h às 17h");
  assert.equal(result.precisaDoHorario, true);
  assert.equal(h.draft.scheduledAt, null, "sem horário exato não salva nada");

  const exact = await h.run("verificar_data_hora", { dia_da_semana: "sábado", hora: "15:00" });
  assert.equal(exact.ok, true);
  assert.equal(new Date(h.draft.scheduledAt!).toISOString(), "2026-10-17T18:00:00.000Z");
});

test("horário fora do funcionamento no sábado (18h) é recusado", async () => {
  const h = harness();
  const result = await h.run("verificar_data_hora", { dia_da_semana: "sábado", hora: "18h" });
  assert.equal(result.ok, false);
});

test("pagamento de 50% é recusado se algum produto exige pagamento integral", async () => {
  const h = harness({ products: [cento, integral] });
  await h.run("adicionar_item", { produto: "torta", quantidade: 1 });
  const result = await h.run("definir_pagamento", { percentual: 50 });
  assert.equal(result.ok, false);
  assert.match(String(result.erro), /Torta/);
  assert.equal((await h.run("definir_pagamento", { percentual: 100, forma: "pix" })).ok, true);
});

test("só Pix e cartão; dinheiro é recusado; 'cartão' sozinho pergunta crédito ou débito", async () => {
  const h = harness();
  assert.equal((await h.run("definir_pagamento", { forma: "dinheiro" })).ok, false);
  const ambiguous = await h.run("definir_pagamento", { forma: "cartão" });
  assert.equal(ambiguous.ok, false);
  assert.match(String(ambiguous.erro), /crédito ou de débito/);
  assert.equal((await h.run("definir_pagamento", { forma: "cartão de débito" })).ok, true);
  assert.equal(h.draft.paymentMethod, "CARTAO_DEBITO");
});

test("entrega: taxa do bairro vem da tabela do site; bairro fora da tabela fica 'a combinar'", async () => {
  const h = harness();
  const known = await h.run("definir_entrega", { tipo: "entrega", rua: "Rua X", numero: "10", bairro: "Camboinha II" });
  assert.match(String(known.taxaDeEntrega), /^R\$\s8,00$/);
  const unknown = await h.run("definir_entrega", { tipo: "entrega", bairro: "João Pessoa" });
  assert.match(String(unknown.taxaDeEntrega), /a combinar/);
  assert.deepEqual(unknown.faltaPreencher, ["itens do pedido", "nome do cliente", "data e horário", "pagar 50% ou 100%", "forma de pagamento (Pix ou cartão)"]);
});

test("ver_resumo recusa pedido incompleto e lista o que falta", async () => {
  const h = harness();
  await h.run("adicionar_item", { produto: "cento", quantidade: 100 });
  const result = await h.run("ver_resumo");
  assert.equal(result.ok, false);
  assert.ok((result.faltaPreencher as string[]).includes("sabores e quantidades dos itens"));
  assert.equal(h.sent.length, 0);
});

test("chamar_humano avisa a Vizinha com o motivo", async () => {
  const h = harness();
  const result = await h.run("chamar_humano", { motivo: "Cliente quer pedido de 2000 salgados" });
  assert.equal(result.ok, true);
  assert.deepEqual(h.handoffs, ["Cliente quer pedido de 2000 salgados"]);
});

test("novo pedido depois de um pedido criado recomeça o rascunho", async () => {
  const h = harness({ draft: { orderId: "order-1", items: [{ productId: "cento", quantity: 1, requestedUnits: 100, selectedItems: [] }] } });
  const result = await h.run("adicionar_item", { produto: "meio cento", quantidade: 1, quantidade_em: "lotes" });
  assert.equal(result.ok, true);
  assert.equal(h.draft.orderId, null);
  assert.equal((h.draft.items as unknown[]).length, 1);
});

test("cardápio: mensagem curta com preço atual, mínimo, regra e sabores vindos do banco", () => {
  const message = buildMenuMessage([cento, meio], { name: "Vizinha Salgateria", cardapioUrl: "https://x/cardapio", pickupAddress: "", });
  assert.match(message, /\*Cento Tradicional\* — R\$\s85,00 \(de R\$\s90,00\) a cada 100 unidades/);
  assert.match(message, /Mínimo: 100 unidades/);
  assert.match(message, /A cada 100 unidades você escolhe até 4 sabores\./);
  assert.match(message, /Sabores: Pastel frito, Pastel frito açucarado/);
  assert.match(message, /A cada 50 unidades você escolhe até 2 sabores\./);
  assert.ok(message.length < 1500);
});

test("erros inesperados viram resposta estruturada, não exceção", async () => {
  const h = harness();
  h.deps.api.storeInfo = async () => { throw new Error("site fora do ar"); };
  const result = await h.run("ver_horarios");
  assert.equal(result.ok, false);
  assert.match(String(result.detalhe), /site fora do ar/);
  assert.equal((await h.run("ferramenta_que_nao_existe")).ok, false);
});

// Cenário real: é sábado (17/10), a loja está fechada pelo painel para hoje e a cliente pede "sábado" / "dia 24".
const SABADO_FECHADO_HOJE = { now: new Date("2026-10-17T11:00:00-03:00"), closedByOwner: true };

test("sábado dito num sábado em que a loja não recebe hoje vale para o PRÓXIMO sábado (24/10)", async () => {
  const h = harness(SABADO_FECHADO_HOJE);
  const result = await h.run("verificar_data_hora", { dia_da_semana: "sábado", periodo: "tarde" });
  assert.equal(result.ok, true);
  assert.equal(result.data, "sábado, 24/10/2026");
  assert.match(String(result.observacao), /próximo dia/);
  assert.equal(result.janelaDisponivel, "das 13h às 17h");

  const exact = await h.run("verificar_data_hora", { dia_da_semana: "sábado", hora: "15h" });
  assert.equal(exact.ok, true);
  assert.equal(new Date(h.draft.scheduledAt!).toISOString(), "2026-10-24T18:00:00.000Z");
});

test("'dia 24' (sábado) está disponível: a ferramenta confirma em vez de o bot achar que está fechado", async () => {
  const h = harness(SABADO_FECHADO_HOJE);
  const result = await h.run("verificar_data_hora", { data: "2026-10-24", hora: "10:00" });
  assert.equal(result.ok, true);
  assert.equal(new Date(h.draft.scheduledAt!).toISOString(), "2026-10-24T13:00:00.000Z");
});

test("hoje, com a loja fechada pelo painel, é recusado e as sugestões começam amanhã", async () => {
  const h = harness(SABADO_FECHADO_HOJE);
  const today = await h.run("verificar_data_hora", { dia_relativo: "hoje", hora: "15h" });
  assert.equal(today.ok, false);
  assert.match(String(today.erro), /Hoje não estamos recebendo/);
  assert.doesNotMatch((today.sugestoes as string[]).join(" "), /\(17\/10\)/);
});

test("ver_horarios: lista mais de 3 dias, não inclui hoje fechado e avisa que a lista é parcial", async () => {
  const h = harness(SABADO_FECHADO_HOJE);
  const result = await h.run("ver_horarios");
  const days = result.proximosDiasDisponiveis as string[];
  assert.ok(days.length >= 5);
  assert.doesNotMatch(days.join(" "), /\(17\/10\)/);
  assert.match(days[0], /Domingo \(18\/10\)/);
  assert.match(String(result.observacao), /parcial.*verificar_data_hora/s);
});
