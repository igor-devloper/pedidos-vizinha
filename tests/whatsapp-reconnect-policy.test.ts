import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKOFF_MAX_MS,
  backoffDelay,
  decideReconnect,
  DISCONNECT_CODES,
} from "../services/whatsapp-bot/src/reconnect-policy.js";

const noJitter = () => 0.5; // multiplicador 1.0

test("loggedOut é o único motivo que apaga a sessão", () => {
  assert.deepEqual(decideReconnect(DISCONNECT_CODES.loggedOut, 0), { action: "logged-out" });

  for (const code of [undefined, 408, 428, 500, 503, 515, 440, 411, 403]) {
    assert.notEqual(decideReconnect(code, 3, noJitter).action, "logged-out", `código ${code}`);
  }
});

test("connectionReplaced cede a vez em vez de reconectar brigando", () => {
  const decision = decideReconnect(DISCONNECT_CODES.connectionReplaced, 0, noJitter);
  assert.equal(decision.action, "yield");
});

test("restartRequired reconecta na hora e não conta como falha", () => {
  assert.deepEqual(decideReconnect(DISCONNECT_CODES.restartRequired, 5, noJitter), {
    action: "reconnect",
    delayMs: 0,
    failure: false,
  });
});

test("backoff exponencial com teto e jitter de ±20%", () => {
  assert.equal(backoffDelay(0, noJitter), 2_000);
  assert.equal(backoffDelay(1, noJitter), 4_000);
  assert.equal(backoffDelay(3, noJitter), 16_000);
  assert.equal(backoffDelay(10, noJitter), BACKOFF_MAX_MS);
  assert.equal(backoffDelay(0, () => 0), 1_600);
  assert.equal(backoffDelay(0, () => 1), 2_400);
});

test("queda inesperada reconecta com backoff e conta como falha", () => {
  assert.deepEqual(decideReconnect(undefined, 2, noJitter), {
    action: "reconnect",
    delayMs: 8_000,
    failure: true,
  });
});

test("auto-start: explícito vale; registros antigos contam se estavam rodando", async () => {
  const { shouldAutoStart } = await import("../services/whatsapp-bot/src/reconnect-policy.js");
  assert.equal(shouldAutoStart({ autoStart: true, status: "idle" }), true);
  assert.equal(shouldAutoStart({ autoStart: false, status: "connected" }), false);
  assert.equal(shouldAutoStart({ status: "connected" }), true);
  assert.equal(shouldAutoStart({ status: "reconnecting" }), true);
  assert.equal(shouldAutoStart({ status: "idle" }), false);
  assert.equal(shouldAutoStart({ status: "disconnected" }), false);
});
