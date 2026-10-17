import assert from "node:assert/strict";
import test from "node:test";

import { buildStoreInfo, checkSchedule, describeWeeklyHours, findEarliestSlot } from "../lib/whatsapp-schedule";
import { normalizeOperationSchedule } from "../lib/site-config";

// Datas em horário de Recife/São Paulo (UTC-3). 2026-10-16 é sexta-feira.
const at = (iso: string) => new Date(`${iso}-03:00`);
const NOW = at("2026-10-16T09:00:00"); // sexta, 9h
const schedule = normalizeOperationSchedule({});

test("domingo às 15h: a loja fecha às 13h e oferece alternativas", () => {
  const result = checkSchedule(at("2026-10-18T15:00:00"), { now: NOW });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /domingo/i);
    assert.match(result.reason, /9h às 13h/);
    assert.ok(result.suggestions.length > 0);
  }
});

test("domingo às 10h é válido", () => {
  assert.deepEqual(checkSchedule(at("2026-10-18T10:00:00"), { now: NOW }), { ok: true });
});

test("segunda de manhã: fechado, sugere a terça", () => {
  const result = checkSchedule(at("2026-10-19T09:00:00"), { now: NOW });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /às segundas/);
    assert.match(result.suggestions.join(" "), /Terça-feira/);
    assert.doesNotMatch(result.suggestions.join(" "), /Segunda/);
  }
});

test("sábado à tarde entre 13h e 17h é válido; depois das 17h não", () => {
  assert.deepEqual(checkSchedule(at("2026-10-17T15:30:00"), { now: NOW }), { ok: true });
  assert.equal(checkSchedule(at("2026-10-17T18:00:00"), { now: NOW }).ok, false);
});

test("antecedência mínima: 1h depois de agora é recusado e sugere o primeiro horário", () => {
  const result = checkSchedule(at("2026-10-16T10:00:00"), { now: NOW, minimumLeadHours: 2 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /2 horas/);
    assert.match(result.suggestions[0], /Primeiro horário possível: Sexta-feira \(16\/10\) às 11:00/);
  }
});

test("loja fechada pelo painel recusa só o dia de hoje", () => {
  const today = checkSchedule(at("2026-10-16T16:00:00"), { now: NOW, storeOpenManually: false });
  assert.equal(today.ok, false);
  assert.deepEqual(checkSchedule(at("2026-10-17T11:00:00"), { now: NOW, storeOpenManually: false }), { ok: true });
});

test("intervalos de 10 minutos", () => {
  assert.equal(checkSchedule(at("2026-10-17T11:05:00"), { now: NOW }).ok, false);
});

test("primeiro horário possível depois de fechar vai para o próximo dia aberto", () => {
  const saturdayEvening = at("2026-10-17T16:30:00");
  const slot = findEarliestSlot(saturdayEvening, 2, schedule);
  assert.ok(slot);
  assert.equal(slot!.toISOString(), at("2026-10-18T09:00:00").toISOString()); // domingo 9h
  const sundayEvening = at("2026-10-18T14:00:00");
  assert.equal(findEarliestSlot(sundayEvening, 2, schedule)!.toISOString(), at("2026-10-20T10:00:00").toISOString()); // terça 10h
});

test("informações da loja e horário da semana", () => {
  const info = buildStoreInfo({ now: at("2026-10-19T11:00:00") }); // segunda
  assert.equal(info.openNow, false);
  assert.equal(info.todayHours, "fechado hoje");
  assert.equal(info.acceptsOrdersForFutureDates, true);
  assert.equal(info.weeklyHours.length, 7);
  assert.equal(describeWeeklyHours()[0].text, "segunda-feira: fechado");
});
