import assert from "node:assert/strict";
import test from "node:test";

import { matchName, resolveFlavors } from "../services/whatsapp-bot/src/agent/name-matching.js";

const flavors = ["Pastel frito", "Pastel frito açucarado", "Bolinha de queijo", "Risole misto", "Coxinha", "Churros"];
const products = ["Cento Tradicional", "Meio cento", "Porção (Salgadinhos)"];

const match = (input: string, options = flavors) => {
  const result = matchName(input, options);
  return result.status === "match" ? result.option : result.status;
};

test("gírias, plural e complementos viram o sabor cadastrado", () => {
  assert.equal(match("coxinha de frango"), "Coxinha");
  assert.equal(match("coxinhas"), "Coxinha");
  assert.equal(match("bolinha"), "Bolinha de queijo");
  assert.equal(match("bolinhas de queijo"), "Bolinha de queijo");
  assert.equal(match("risoles"), "Risole misto");
  assert.equal(match("churros"), "Churros");
});

test("pastel doce / de açúcar / pastelzinho doce → pastel frito açucarado", () => {
  assert.equal(match("pastel doce"), "Pastel frito açucarado");
  assert.equal(match("pastel de açúcar"), "Pastel frito açucarado");
  assert.equal(match("pastelzinho doce"), "Pastel frito açucarado");
  assert.equal(match("pastéis açucarados"), "Pastel frito açucarado");
});

test("na dúvida, pergunta: 'pastel' sozinho é ambíguo, 'pastel frito' não", () => {
  const ambiguous = matchName("pastel", flavors);
  assert.equal(ambiguous.status, "ambiguous");
  if (ambiguous.status === "ambiguous") {
    assert.deepEqual(ambiguous.options, ["Pastel frito", "Pastel frito açucarado"]);
  }
  assert.equal(match("pastel frito"), "Pastel frito");
});

test("erros de digitação são corrigidos; o que não existe não é inventado", () => {
  assert.equal(match("coxnha"), "Coxinha");
  assert.equal(match("churos"), "Churros");
  assert.equal(match("empada"), "none");
  assert.equal(match("hamburguer"), "none");
  assert.equal(match(""), "none");
});

test("nomes de produto: 'cento' é o Cento Tradicional, não o Meio cento", () => {
  assert.equal(match("cento", products), "Cento Tradicional");
  assert.equal(match("um cento", products), "Cento Tradicional");
  assert.equal(match("meio cento", products), "Meio cento");
  assert.equal(match("porção", products), "Porção (Salgadinhos)");
  assert.equal(match("porcao", products), "Porção (Salgadinhos)");
  assert.equal(match("salgadinhos", products), "Porção (Salgadinhos)");
});

test("resolveFlavors soma repetidos e separa o que não entendeu", () => {
  const { resolved, problems } = resolveFlavors(
    [
      { sabor: "coxinha de frango", quantidade: 30 },
      { sabor: "Coxinha", quantidade: 20 },
      { sabor: "pastel", quantidade: 10 },
      { sabor: "empada", quantidade: 5 },
    ],
    flavors,
  );
  assert.deepEqual(resolved, [{ tipo: "Coxinha", quantidade: 50 }]);
  assert.equal(problems.length, 2);
  assert.equal(problems[0].kind, "ambiguous");
  assert.equal(problems[1].kind, "none");
});
