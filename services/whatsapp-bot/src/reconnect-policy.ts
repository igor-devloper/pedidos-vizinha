// Códigos de DisconnectReason do Baileys (copiados para esta lógica não depender do runtime dele).
export const DISCONNECT_CODES = {
  loggedOut: 401,
  connectionReplaced: 440,
  restartRequired: 515,
} as const;

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 60_000;
export const YIELD_DELAY_MS = 30_000;

export type ReconnectDecision =
  /** Reconectar. `failure` indica se conta para o backoff (restartRequired é rotina). */
  | { action: "reconnect"; delayMs: number; failure: boolean }
  /** O WhatsApp invalidou a sessão: limpar credenciais e pedir QR novo. */
  | { action: "logged-out" }
  /** Outro processo assumiu a mesma sessão: soltar o lock e voltar à fila, sem brigar. */
  | { action: "yield"; delayMs: number };

export function backoffDelay(failures: number, random: () => number = Math.random) {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures));
  return Math.round(base * (0.8 + 0.4 * random()));
}

/**
 * Decide o que fazer quando a conexão fecha. Só `loggedOut` apaga a sessão.
 * `failures` = quantas falhas seguidas já ocorreram desde a última conexão aberta.
 */
export function decideReconnect(
  code: number | undefined,
  failures: number,
  random: () => number = Math.random
): ReconnectDecision {
  if (code === DISCONNECT_CODES.loggedOut) {
    return { action: "logged-out" };
  }

  if (code === DISCONNECT_CODES.connectionReplaced) {
    return { action: "yield", delayMs: YIELD_DELAY_MS };
  }

  if (code === DISCONNECT_CODES.restartRequired) {
    return { action: "reconnect", delayMs: 0, failure: false };
  }

  return { action: "reconnect", delayMs: backoffDelay(failures, random), failure: true };
}
