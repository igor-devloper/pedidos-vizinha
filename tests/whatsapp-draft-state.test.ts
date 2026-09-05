import assert from "node:assert/strict";
import test from "node:test";
import { getMissingDraftField, getNextDraftQuestion, normalizeFulfillmentType, parseBrazilianScheduledAt, type DraftProduct } from "../services/whatsapp-bot/src/whatsapp-draft-state.js";

type WhatsappDraft = Parameters<typeof getMissingDraftField>[0] & Record<string, unknown>;

function draft(overrides: Partial<WhatsappDraft> = {}): WhatsappDraft {
  return {
    id: "draft-1", instanceId: "instance-1", remoteJid: "customer", phone: "5583999999999",
    customerName: null, customerEmail: null, stage: "COLLECTING", status: "ACTIVE",
    fulfillmentType: null, scheduledAt: null, deliveryStreet: null, deliveryNumber: null,
    deliveryNeighborhood: null, deliveryReference: null, paymentMethod: null,
    paymentPercentage: null, items: [], siteLinkSentAt: null, whatsappOfferDueAt: null,
    whatsappOfferSentAt: null, siteOrderDetectedAt: null, orderId: null,
    lastCustomerMessageAt: null, lastBotMessageAt: null, ...overrides,
  };
}

test("normaliza entrega para o enum canônico", () => {
  assert.equal(normalizeFulfillmentType("Quero entregar"), "DELIVERY");
  assert.equal(normalizeFulfillmentType("vou retirar"), "PICKUP");
});

test("interpreta dia e horário em português", () => {
  assert.equal(
    parseBrazilianScheduledAt("pode ser pro dia 10 as 17hrs", new Date("2026-09-04T15:00:00Z")),
    "2026-09-10T20:00:00.000Z",
  );
});

test("pede os campos uma única vez na ordem canônica", () => {
  const withItems = draft({ items: [{ productId: "p1", requestedUnits: 100 }] });
  assert.equal(getMissingDraftField(withItems), "scheduledAt");
  const address = draft({
    items: [{ productId: "p1", requestedUnits: 100 }], fulfillmentType: "DELIVERY",
    deliveryStreet: "Rua A", deliveryNumber: "10", deliveryNeighborhood: "Centro", deliveryReference: "Mercado",
  });
  assert.equal(getMissingDraftField(address), "scheduledAt");
  assert.match(getNextDraftQuestion(address), /dia e horário/);
});

test("não permite confirmação enquanto houver dado faltante", () => {
  const complete = draft({
    items: [{ productId: "p1", requestedUnits: 100 }], fulfillmentType: "PICKUP",
    scheduledAt: "2026-09-10T20:00:00.000Z", customerName: "Igor", customerEmail: "igor@example.com",
    paymentMethod: "PIX", paymentPercentage: 50,
  });
  assert.equal(getMissingDraftField(complete), null);
});

test("horário da conversa e ISO sem fuso preservam 17h de São Paulo", () => {
  assert.equal(parseBrazilianScheduledAt("dia 10 de 17hr", new Date("2026-09-05T15:00:00Z")), "2026-09-10T20:00:00.000Z");
  assert.equal(parseBrazilianScheduledAt("2026-09-10T17:00:00"), "2026-09-10T20:00:00.000Z");
  assert.equal(parseBrazilianScheduledAt("2026-09-10T17:00:00-03:00"), "2026-09-10T20:00:00.000Z");
});

const product: DraftProduct = {
  id: "p1", nome: "Salgados de forno", categoria: "CENTO", totalUnidades: 100,
  maxTiposSalgado: 2, precisaSelecaoDeTipos: true, minQuantity: 50, allowsMultiple: true,
  saboresSugeridos: ["Empada de Frango", "Pastel de Forno"],
};

test("seleção incompleta bloqueia avanço para a data e limita opções ao produto", () => {
  const current = draft({ items: [{ productId: "p1", quantity: 1, requestedUnits: 100, selectedItems: [] }] });
  assert.equal(getMissingDraftField(current, [product]), "itemSelection");
  assert.match(getNextDraftQuestion(current, [product]), /Empada de Frango, Pastel de Forno/);
  assert.doesNotMatch(getNextDraftQuestion(current, [product]), /dia e horário|Coxinha/);
  current.items = [{ productId: "p1", quantity: 1, requestedUnits: 100, selectedItems: [{ tipo: "Empada de Frango", quantidade: 100 }] }];
  assert.equal(getMissingDraftField(current, [product]), "scheduledAt");
});

test("não aceita sabores de outro produto nem quantidades abaixo do mínimo", () => {
  const current = draft({ items: [{ productId: "p1", quantity: 1, requestedUnits: 100, selectedItems: [{ tipo: "Coxinha", quantidade: 100 }] }] });
  assert.equal(getMissingDraftField(current, [product]), "itemSelection");
  assert.match(getNextDraftQuestion(current, [product]), /não é uma opção disponível/);
  current.items = [{ productId: "p1", quantity: 1, requestedUnits: 30, selectedItems: [{ tipo: "Empada de Frango", quantidade: 30 }] }];
  assert.match(getNextDraftQuestion(current, [product]), /mínima é 50/);
});

test("produto sem tipos pede quantidade do produto, depois data, dados e modalidade", () => {
  const plain = { ...product, precisaSelecaoDeTipos: false, allowsMultiple: false, totalUnidades: 1 };
  const current = draft({ items: [{ productId: "p1", quantity: 0 }] });
  assert.match(getNextDraftQuestion(current, [plain]), /Qual quantidade/);
  current.items = [{ productId: "p1", quantity: 3 }];
  assert.equal(getMissingDraftField(current, [plain]), "scheduledAt");
  current.scheduledAt = "2026-09-10T20:00:00Z";
  assert.match(getNextDraftQuestion(current, [plain]), /nome e e-mail/);
  current.customerName = "Igor";
  current.customerEmail = "igor@example.com";
  assert.equal(getMissingDraftField(current, [plain]), "fulfillmentType");
  current.fulfillmentType = "DELIVERY";
  assert.match(getNextDraftQuestion(current, [plain]), /rua, o número, o bairro, um ponto de referência/);
  current.deliveryNeighborhood = "Centro";
  assert.doesNotMatch(getNextDraftQuestion(current, [plain]), /bairro/);
  current.fulfillmentType = "PICKUP";
  assert.equal(getMissingDraftField(current, [plain]), "paymentMethod");
});

test("telefone ausente é pedido junto com os dados pessoais", () => {
  const current = draft({ items: [{ productId: "p1", quantity: 1 }], scheduledAt: "2026-09-10T20:00:00Z", phone: "" });
  assert.match(getNextDraftQuestion(current), /nome e e-mail e número com DDD/);
});
