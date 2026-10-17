import assert from "node:assert/strict";
import test from "node:test";

import { mergeInboundJobs } from "../services/whatsapp-bot/src/agent/merge-jobs.js";
import type { InboundMessageJob } from "../services/whatsapp-bot/src/types.js";

function job(overrides: Partial<InboundMessageJob>): InboundMessageJob {
  return {
    instanceId: "i1",
    remoteJid: "5583999990000@s.whatsapp.net",
    text: "",
    messageId: "m",
    receivedAt: "2026-10-16T12:00:00.000Z",
    ...overrides,
  };
}

test("uma mensagem só passa direto", () => {
  const single = job({ text: "oi", messageId: "a" });
  assert.equal(mergeInboundJobs([single]), single);
});

test("rajada vira um texto em linhas, com o id e a hora da última mensagem", () => {
  const merged = mergeInboundJobs([
    job({ text: "oi", messageId: "a", receivedAt: "2026-10-16T12:00:00.000Z", pushName: "Maria" }),
    job({ text: "quero um cento", messageId: "b", receivedAt: "2026-10-16T12:00:03.000Z" }),
    job({ text: "  ", messageId: "c", receivedAt: "2026-10-16T12:00:05.000Z" }),
    job({ text: "de coxinha", messageId: "d", receivedAt: "2026-10-16T12:00:08.000Z" }),
  ]);
  assert.equal(merged.text, "oi\nquero um cento\nde coxinha");
  assert.equal(merged.messageId, "d");
  assert.equal(merged.receivedAt, "2026-10-16T12:00:08.000Z");
  assert.equal(merged.pushName, "Maria");
});

test("áudio no meio da rajada mantém o tipo de mídia mas não carrega o arquivo", () => {
  const merged = mergeInboundJobs([
    job({ text: "(áudio) quero cem coxinhas", mediaKind: "audio", mediaMimeType: "audio/ogg", mediaBase64: "AAAA", messageId: "a" }),
    job({ text: "pra sábado", messageId: "b" }),
  ]);
  assert.equal(merged.mediaKind, "audio");
  assert.equal(merged.mediaBase64, undefined);
  assert.equal(merged.text, "(áudio) quero cem coxinhas\npra sábado");
});
