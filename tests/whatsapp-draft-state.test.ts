import assert from "node:assert/strict";
import test from "node:test";
import { getMissingDraftField, getNextDraftQuestion, normalizeFulfillmentType, parseBrazilianScheduledAt } from "../services/whatsapp-bot/src/whatsapp-draft-state.js";

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
  assert.equal(getMissingDraftField(withItems), "fulfillmentType");
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
