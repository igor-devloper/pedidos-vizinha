import assert from "node:assert/strict";
import test from "node:test";

import { buildStoreNotice, describeNextOpening } from "../lib/store-notice";

const at = (iso: string) => new Date(`${iso}-03:00`);
const schedule = {};

test("sexta à noite: abre amanhã (sábado) às 10h", () => {
  const notice = buildStoreNotice({ now: at("2026-10-16T20:00:00"), operationSchedule: schedule, closedByOwner: false });
  assert.deepEqual(notice, {
    title: "Estamos fechados agora",
    text: "Abrimos amanhã (sábado) às 10h. Você já pode encomendar para outro dia.",
  });
});

test("antes de abrir no mesmo dia: abre hoje", () => {
  assert.equal(describeNextOpening(at("2026-10-16T07:30:00"), schedule), "hoje às 10h");
});

test("domingo à tarde: a próxima abertura é terça (segunda é fechado)", () => {
  assert.equal(describeNextOpening(at("2026-10-18T15:00:00"), schedule), "terça-feira às 10h");
});

test("sábado à noite: abre domingo às 9h", () => {
  assert.equal(describeNextOpening(at("2026-10-17T19:00:00"), schedule), "amanhã (domingo) às 9h");
});

test("loja aberta não mostra aviso", () => {
  assert.equal(buildStoreNotice({ now: at("2026-10-16T11:00:00"), operationSchedule: schedule, closedByOwner: false }), null);
});

test("fechada pelo painel: avisa que hoje não recebe, mas aceita outro dia", () => {
  const notice = buildStoreNotice({ now: at("2026-10-16T11:00:00"), operationSchedule: schedule, closedByOwner: true });
  assert.match(notice!.title, /Hoje não estamos recebendo pedidos/);
  assert.match(notice!.text, /encomendar para outro dia/);
});

test("descrição antiga 'por cento de salgado' vira linguagem simples", async () => {
  const { cleanProductDescription } = await import("../lib/produtos");
  assert.equal(
    cleanProductDescription("Salgadinhos fritos. Escolher no máximo 2 opções por cento de salgado.", 30),
    "Salgadinhos fritos. Escolher no máximo 2 opções a cada 30 salgados.",
  );
  assert.equal(cleanProductDescription("Máximo de 4 por cento de salgados", null), "Máximo de 4 a cada lote de salgados");
  assert.equal(cleanProductDescription("Sem problema aqui", 50), "Sem problema aqui");
});

test("descrição curta: corta lista de sabores repetida e some quando igual ao nome", async () => {
  const { shortProductDescription } = await import("../lib/produtos");
  assert.equal(
    shortProductDescription("Cento de fritos: - Pastel Frito - Coxinha Obs: Escolher no máximo 4 opções por cento de salgado.", "Cento Tradicional", 100),
    "Cento de fritos",
  );
  assert.equal(shortProductDescription("Cento/meio de fritos ou de forno", "Cento/meio de fritos ou de forno", 50), "");
  assert.equal(shortProductDescription("Salgados feitos no dia", "Combo", null), "Salgados feitos no dia");
});

test("cartão de status: aberto mostra até que horas; fechado mostra quando abre", async () => {
  const { buildStoreStatusView } = await import("../lib/store-notice");
  assert.deepEqual(buildStoreStatusView({ now: at("2026-10-16T11:00:00"), operationSchedule: schedule, closedByOwner: false }), {
    open: true,
    title: "Estamos abertos agora · até as 17h",
    detail: null,
  });
  assert.deepEqual(buildStoreStatusView({ now: at("2026-10-18T15:00:00"), operationSchedule: schedule, closedByOwner: false }), {
    open: false,
    title: "Estamos fechados agora",
    detail: "Abrimos terça-feira às 10h. Você já pode encomendar.",
  });
  const owner = buildStoreStatusView({ now: at("2026-10-16T11:00:00"), operationSchedule: schedule, closedByOwner: true });
  assert.equal(owner.open, false);
});

test("horário agrupado em linhas legíveis, começando na terça", async () => {
  const { groupOpeningHours } = await import("../lib/store-notice");
  assert.deepEqual(groupOpeningHours({}), [
    { label: "Terça a sábado", hours: "10h às 17h", open: true },
    { label: "Domingo", hours: "9h às 13h", open: true },
    { label: "Segunda", hours: "Fechado", open: false },
  ]);
  // semana personalizada: sexta a domingo fechados (como no cadastro atual)
  const custom = groupOpeningHours({ 5: { isOpen: false }, 6: { isOpen: false }, 0: { isOpen: false } });
  assert.deepEqual(custom.map((row) => `${row.label} · ${row.hours}`), ["Terça a quinta · 10h às 17h", "Sexta a segunda · Fechado"]);
});
