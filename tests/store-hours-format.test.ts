import assert from "node:assert/strict";
import test from "node:test";

import { summarizeWeekly, type WeeklyEntry } from "../services/whatsapp-bot/src/store-hours-format.js";

const day = (weekday: number, hours?: [number, number]): WeeklyEntry => ({
  weekday,
  open: Boolean(hours),
  openHour: hours?.[0] ?? null,
  closeHour: hours?.[1] ?? null,
});

test("o resumo segue exatamente o que está configurado, não um texto fixo", () => {
  const padrao = [day(0, [9, 13]), day(1), day(2, [10, 17]), day(3, [10, 17]), day(4, [10, 17]), day(5, [10, 17]), day(6, [10, 17])];
  assert.equal(summarizeWeekly(padrao), "Terça a sábado: 10h às 17h; Domingo: 9h às 13h; Segunda: fechado");

  // Semana em que a loja não atende de sexta a domingo (como no painel desta semana)
  const semFimDeSemana = [day(0), day(1), day(2, [10, 17]), day(3, [10, 17]), day(4, [10, 17]), day(5), day(6)];
  assert.equal(summarizeWeekly(semFimDeSemana), "Terça a quinta: 10h às 17h; Sexta a segunda: fechado");

  // Horário diferente em um dia só
  const sabadoCurto = [day(0), day(1), day(2, [10, 17]), day(3, [10, 17]), day(4, [10, 17]), day(5, [10, 17]), day(6, [8, 12])];
  assert.equal(summarizeWeekly(sabadoCurto), "Terça a sexta: 10h às 17h; Sábado: 8h às 12h; Domingo e segunda: fechado");
});
