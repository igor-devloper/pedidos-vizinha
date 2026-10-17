import assert from "node:assert/strict";
import test from "node:test";

import {
  describeCart,
  removeLine,
  setLine,
  suggestSplit,
  type AgentProduct,
  type CartLine,
} from "../services/whatsapp-bot/src/agent/cart.js";

const FLAVORS = ["Pastel frito", "Pastel frito açucarado", "Bolinha de queijo", "Risole misto", "Coxinha", "Churros"];

function product(overrides: Partial<AgentProduct>): AgentProduct {
  return {
    id: "p",
    nome: "Produto",
    descricao: "",
    preco: "0",
    descontoPercentual: "0",
    categoria: "CENTO",
    emPromocao: false,
    totalUnidades: 100,
    maxTiposSalgado: 4,
    permitePagamentoParcial: true,
    saboresSugeridos: FLAVORS,
    comboItens: [],
    antecedenciaMinimaHoras: null,
    precisaSelecaoDeTipos: true,
    minQuantity: 100,
    allowsMultiple: true,
    ...overrides,
  };
}

const cento = product({ id: "cento", nome: "Cento Tradicional", preco: "90", emPromocao: true, descontoPercentual: "5.56" });
const meio = product({ id: "meio", nome: "Meio cento", preco: "45", totalUnidades: 50, minQuantity: 50, maxTiposSalgado: 2 });
const porcao = product({ id: "porcao", nome: "Porção (Salgadinhos)", preco: "25", totalUnidades: 30, minQuantity: 30, maxTiposSalgado: 2 });
const combo = product({
  id: "combo",
  nome: "Combo Festa",
  categoria: "COMBO",
  preco: "120",
  totalUnidades: 60,
  maxTiposSalgado: 2,
  minQuantity: null,
  allowsMultiple: false,
  comboItens: [{ nome: "Coxinha", quantidade: 30 }, { nome: "Churros", quantidade: 30 }],
});
const products = [cento, meio, porcao, combo];

function add(args: Parameters<typeof setLine>[2], lines: CartLine[] = []) {
  return setLine(products, lines, args);
}

test("um cento de coxinha e bolinha: pede a divisão e sugere 50/50 sem decidir sozinho", () => {
  const result = add({ produto: "cento", quantidade: 1, quantidade_em: "lotes", sabores: [{ sabor: "coxinha" }, { sabor: "bolinha" }] });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.erro, /Faltam as quantidades/);
    assert.match(result.sugestoes?.[0] ?? "", /50 de cada/);
  }

  const confirmed = add({ produto: "cento", quantidade: 1, quantidade_em: "lotes", sabores: [{ sabor: "coxinha", quantidade: 50 }, { sabor: "bolinha", quantidade: 50 }] });
  assert.equal(confirmed.ok, true);
  if (confirmed.ok) {
    assert.equal(confirmed.line.requestedUnits, 100);
    assert.equal(confirmed.status.complete, true);
  }
});

test("100 salgado misturado: aceita o item e informa que faltam os sabores", () => {
  const result = add({ produto: "cento", quantidade: 100 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status.complete, false);
    assert.equal(result.status.missingUnits, 100);
    assert.equal(result.status.maxTypes, 4);
  }
});

test("200 sendo 50 de cada: 200 un libera 8 sabores e ainda faltam as escolhas", () => {
  const result = add({ produto: "cento", quantidade: 200 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status.maxTypes, 8);
    assert.equal(result.status.missingUnits, 200);
  }
});

test("meio cento de churros: 50 churros, um sabor ocupa tudo, 45 reais", () => {
  const result = add({ produto: "meio cento", quantidade: 1, quantidade_em: "lotes", sabores: [{ sabor: "churros" }] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.line.selectedItems, [{ tipo: "Churros", quantidade: 50 }]);
    assert.equal(result.status.complete, true);
    assert.equal(describeCart(products, result.lines).totalNumero, 45);
  }
});

test("2 porção: 60 unidades, 50 reais, faltam os sabores", () => {
  const result = add({ produto: "porção", quantidade: 2, quantidade_em: "lotes" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.line.requestedUnits, 60);
    assert.equal(result.status.missingUnits, 60);
    assert.equal(describeCart(products, result.lines).totalNumero, 50);
  }
});

test("tem empada? não inventa: erro com o que existe", () => {
  const result = add({ produto: "cento", quantidade: 100, sabores: [{ sabor: "empada", quantidade: 100 }] });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.erro, /Não temos "empada"/);
    assert.match(result.erro, /Coxinha/);
  }
  const unknownProduct = add({ produto: "hamburguer", quantidade: 1 });
  assert.equal(unknownProduct.ok, false);
  if (!unknownProduct.ok) assert.match(unknownProduct.erro, /Produtos disponíveis: Cento Tradicional, Meio cento/);
});

test("quero 80 do cento: abaixo do mínimo, sugere Meio cento + Porção ou 100 un", () => {
  const result = add({ produto: "cento", quantidade: 80 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.erro, /mínimo de 100/);
    assert.match(result.sugestoes!.join(" | "), /1 × Meio cento \(50 un\) \+ 1 × Porção \(Salgadinhos\) \(30 un\) = 80 unidades/);
    assert.match(result.sugestoes!.join(" | "), /Aumentar para 100 unidades/);
  }
});

test("5 sabores no cento: explica o limite de 4 e oferece 200 un (8 sabores)", () => {
  const result = add({
    produto: "cento",
    quantidade: 100,
    sabores: ["Bolinha de queijo", "Risole misto", "Coxinha", "Churros", "Pastel frito"].map((sabor) => ({ sabor, quantidade: 20 })),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.erro, /limite é de 4 sabores/);
    assert.match(result.sugestoes!.join(" | "), /200 unidades, que libera até 8 sabores/);
  }
});

test("150 un no cento: preço linear (127,50) e limite de 4 sabores, como no site", () => {
  const result = add({ produto: "cento", quantidade: 150 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status.maxTypes, 4);
    assert.equal(describeCart(products, result.lines).totalNumero, 127.5);
  }
});

test("soma dos sabores maior que o total é recusada; menor fica pendente", () => {
  const over = add({ produto: "cento", quantidade: 100, sabores: [{ sabor: "coxinha", quantidade: 60 }, { sabor: "churros", quantidade: 60 }] });
  assert.equal(over.ok, false);
  if (!over.ok) assert.match(over.erro, /somam 120/);

  const under = add({ produto: "cento", quantidade: 100, sabores: [{ sabor: "coxinha", quantidade: 30 }, { sabor: "churros", quantidade: 30 }] });
  assert.equal(under.ok, true);
  if (under.ok) assert.equal(under.status.missingUnits, 40);
});

test("alterar só os sabores preserva a quantidade; chamar de novo substitui a linha", () => {
  const first = add({ produto: "cento", quantidade: 100 });
  assert.ok(first.ok);
  const second = add({ produto: "cento", sabores: [{ sabor: "coxinha", quantidade: 100 }] }, first.ok ? first.lines : []);
  assert.ok(second.ok);
  if (second.ok) {
    assert.equal(second.lines.length, 1);
    assert.equal(second.line.requestedUnits, 100);
    assert.equal(second.replaced, true);
    assert.equal(second.status.complete, true);
  }
});

test("combo de composição fixa não pede sabores e multiplica pela quantidade", () => {
  const result = add({ produto: "combo festa", quantidade: 2 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.line.selectedItems, [
      { tipo: "Coxinha", quantidade: 60 },
      { tipo: "Churros", quantidade: 60 },
    ]);
    assert.equal(result.status.complete, true);
    assert.equal(describeCart(products, result.lines).totalNumero, 240);
  }
});

test("remover item e carrinho vazio", () => {
  const added = add({ produto: "porção", quantidade: 1, quantidade_em: "lotes" });
  assert.ok(added.ok);
  if (!added.ok) return;
  const removed = removeLine(products, added.lines, "porcao");
  assert.ok(removed.ok);
  if (removed.ok) assert.deepEqual(removed.lines, []);
  assert.equal(removeLine(products, added.lines, "cento").ok, false);
  assert.equal(describeCart(products, []).todosCompletos, false);
});

test("divisões exatas de lotes", () => {
  const lots = [cento, meio, porcao];
  assert.equal(suggestSplit(130, lots), "1 × Cento Tradicional (100 un) + 1 × Porção (Salgadinhos) (30 un) = 130 unidades");
  assert.equal(suggestSplit(60, lots), "2 × Porção (Salgadinhos) (30 un) = 60 unidades");
  assert.equal(suggestSplit(20, lots), null);
});
