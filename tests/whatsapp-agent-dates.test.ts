import assert from "node:assert/strict";
import test from "node:test";

import { addDays, describeLocalDate, parseTime, resolveDate, toInstant } from "../services/whatsapp-bot/src/agent/dates.js";

// Sexta-feira, 16/10/2026, 09:00 em Recife (UTC-3).
const NOW = new Date("2026-10-16T09:00:00-03:00");

test("dia da semana vira a próxima data; 'sábado' numa sexta é amanhã", () => {
  const result = resolveDate(NOW, { dia_da_semana: "sábado" });
  assert.ok(result.ok);
  if (result.ok) assert.equal(describeLocalDate(result.date), "sábado, 17/10/2026");

  const monday = resolveDate(NOW, { dia_da_semana: "segunda-feira" });
  assert.ok(monday.ok);
  if (monday.ok) assert.equal(describeLocalDate(monday.date), "segunda-feira, 19/10/2026");
});

test("o mesmo dia da semana de hoje conta como hoje", () => {
  const result = resolveDate(NOW, { dia_da_semana: "sexta" });
  assert.ok(result.ok);
  if (result.ok) assert.equal(describeLocalDate(result.date), "sexta-feira, 16/10/2026");
});

test("hoje, amanhã e data explícita", () => {
  const tomorrow = resolveDate(NOW, { dia_relativo: "amanhã" });
  assert.ok(tomorrow.ok);
  if (tomorrow.ok) assert.deepEqual(tomorrow.date, addDays({ year: 2026, month: 10, day: 16 }, 1));

  const iso = resolveDate(NOW, { data: "2026-12-24" });
  assert.ok(iso.ok);
  if (iso.ok) assert.equal(describeLocalDate(iso.date), "quinta-feira, 24/12/2026");

  const br = resolveDate(NOW, { data: "10/10" }); // já passou neste ano → ano que vem
  assert.ok(br.ok);
  if (br.ok) assert.equal(br.date.year, 2027);
});

test("entradas inválidas viram erro claro", () => {
  assert.equal(resolveDate(NOW, { data: "ontem" }).ok, false);
  assert.equal(resolveDate(NOW, { dia_da_semana: "feriado" }).ok, false);
  assert.equal(resolveDate(NOW, {}).ok, false);
});

test("horas em vários formatos, e o instante usa o fuso -03:00", () => {
  assert.deepEqual(parseTime("15h"), { hour: 15, minute: 0 });
  assert.deepEqual(parseTime("15:30"), { hour: 15, minute: 30 });
  assert.deepEqual(parseTime("9h30"), { hour: 9, minute: 30 });
  assert.deepEqual(parseTime("10"), { hour: 10, minute: 0 });
  assert.equal(parseTime("25h"), null);
  assert.equal(parseTime("tarde"), null);
  assert.equal(toInstant({ year: 2026, month: 10, day: 17 }, { hour: 15, minute: 0 }).toISOString(), "2026-10-17T18:00:00.000Z");
});
