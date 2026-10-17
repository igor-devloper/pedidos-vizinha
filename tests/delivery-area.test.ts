import assert from "node:assert/strict";
import test from "node:test";

import { DELIVERY_FEES, getDeliveryFee, OUT_OF_AREA_MESSAGE } from "../lib/delivery";
import { checkDeliveryArea } from "../services/whatsapp-bot/src/agent/delivery-area.js";

test("a área de entrega é só do Centro de Cabedelo até Camboinha", () => {
  assert.deepEqual(DELIVERY_FEES.map((area) => area.fee), [5, 8]);
  assert.match(OUT_OF_AREA_MESSAGE, /Entregamos apenas do Centro de Cabedelo até Camboinha/);
});

test("bairros da área têm taxa; os demais não são atendidos", () => {
  assert.equal(getDeliveryFee("Camboinha II").fee, 8);
  assert.equal(getDeliveryFee("Jardim Manguinhos").fee, 5);
  assert.equal(getDeliveryFee("Ponta de Matos").covered, true);
  for (const outside of ["Poço", "Praia do Poço", "Intermares", "Jacaré", "Ponta de Campina", "Portal do Poço", "Bessa", "Manaíra", ""]) {
    const quote = getDeliveryFee(outside);
    assert.equal(quote.covered, false, outside);
    assert.equal(quote.agreed, false, outside);
  }
});

test("'Centro' só vale em Cabedelo; cidade diferente barra qualquer bairro", () => {
  assert.equal(getDeliveryFee("Centro").needsCity, true);
  assert.equal(getDeliveryFee("Centro").covered, false);
  assert.equal(getDeliveryFee("Centro", "Cabedelo").covered, true);
  assert.equal(getDeliveryFee("Centro, Cabedelo").covered, true);
  assert.equal(getDeliveryFee("Centro", "João Pessoa").covered, false);
  assert.equal(getDeliveryFee("Camboinha", "João Pessoa").covered, false);
  assert.equal(getDeliveryFee("Camboinha", "Cabedelo").covered, true);
});

test("o nome do bairro é casado por palavra inteira, não por pedaço", () => {
  assert.equal(getDeliveryFee("Centro Histórico, João Pessoa").covered, false);
  assert.equal(getDeliveryFee("Bairro dos Estados").covered, false);
});

test("a cópia da regra no bot dá o mesmo resultado que a do site", () => {
  const fees = DELIVERY_FEES.map(({ label, fee, neighborhoods }) => ({ area: label, fee, neighborhoods: [...neighborhoods] }));
  const cases: Array<[string, string | undefined]> = [
    ["Camboinha II", undefined], ["Camboinha", "João Pessoa"], ["Centro", undefined], ["Centro", "Cabedelo"],
    ["Centro, Cabedelo", undefined], ["Poço", undefined], ["Intermares", "Cabedelo"], ["Vila São João", undefined], ["", undefined],
  ];
  for (const [neighborhood, city] of cases) {
    const site = getDeliveryFee(neighborhood, city);
    const bot = checkDeliveryArea(fees, neighborhood, city);
    assert.deepEqual({ covered: bot.covered, fee: bot.fee, needsCity: bot.needsCity }, { covered: site.covered, fee: site.fee, needsCity: site.needsCity }, `${neighborhood} / ${city}`);
  }
});
