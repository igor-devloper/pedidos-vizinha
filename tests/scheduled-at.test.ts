import assert from "node:assert/strict";
import test from "node:test";

import { businessInstantToFixedUtcLocal, fixedUtcLocalToBusinessInstant } from "../lib/scheduled-at";

test("17h em Recife é gravado como 17:00Z (não 20:00Z), igual ao carrinho do site", () => {
  const seventeen = new Date("2026-10-24T17:00:00-03:00"); // = 20:00Z
  assert.equal(seventeen.toISOString(), "2026-10-24T20:00:00.000Z");
  assert.equal(businessInstantToFixedUtcLocal(seventeen).toISOString(), "2026-10-24T17:00:00.000Z");
});

test("a conversão inversa devolve o instante real, e ida e volta não perde nada", () => {
  const stored = new Date("2026-10-24T17:00:00.000Z");
  assert.equal(fixedUtcLocalToBusinessInstant(stored).toISOString(), "2026-10-24T20:00:00.000Z");
  for (const iso of ["2026-10-24T10:00:00-03:00", "2026-10-24T23:30:00-03:00", "2026-12-31T00:10:00-03:00"]) {
    const instant = new Date(iso);
    assert.equal(fixedUtcLocalToBusinessInstant(businessInstantToFixedUtcLocal(instant)).toISOString(), instant.toISOString());
  }
});

test("perto da meia-noite o dia continua o dia local (23:30 em Recife já é o dia seguinte em UTC)", () => {
  const lateNight = new Date("2026-10-24T23:30:00-03:00"); // = 26:30Z → 02:30Z do dia 25
  assert.equal(lateNight.toISOString(), "2026-10-25T02:30:00.000Z");
  assert.equal(businessInstantToFixedUtcLocal(lateNight).toISOString(), "2026-10-24T23:30:00.000Z");
});
