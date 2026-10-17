import assert from "node:assert/strict";
import test from "node:test";

import { createBatcher } from "../services/whatsapp-bot/src/agent/batcher.js";
import {
  historyToContents,
  runAgentLoop,
  type AgentContent,
  type ModelClient,
  type ModelTurn,
} from "../services/whatsapp-bot/src/agent/agent-loop.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function scriptedModel(turns: Array<Partial<ModelTurn>>) {
  const seen: AgentContent[][] = [];
  let index = 0;
  const model: ModelClient = {
    async generate(contents) {
      seen.push(structuredClone(contents));
      const turn = turns[index++] ?? { text: "fim" };
      return {
        text: turn.text ?? "",
        functionCalls: turn.functionCalls ?? [],
        modelContent: turn.modelContent ?? { role: "model", parts: (turn.functionCalls ?? []).map((call) => ({ functionCall: call })) },
      };
    },
  };
  return { model, seen };
}

test("o laço executa as ferramentas pedidas e devolve o resultado ao modelo", async () => {
  const { model, seen } = scriptedModel([
    { functionCalls: [{ name: "adicionar_item", args: { produto: "cento", quantidade: 80 } }] },
    { functionCalls: [{ name: "ver_cardapio", args: {} }] },
    { text: "  Esse item precisa de no mínimo 100 unidades. Quer 100?  " },
  ]);
  const executed: string[] = [];
  const result = await runAgentLoop({
    model,
    history: [{ role: "user", parts: [{ text: "quero 80 do cento" }] }],
    runTool: async (name) => {
      executed.push(name);
      return name === "adicionar_item" ? { ok: false, erro: "mínimo de 100" } : { ok: true };
    },
  });

  assert.deepEqual(executed, ["adicionar_item", "ver_cardapio"]);
  assert.equal(result.reply, "Esse item precisa de no mínimo 100 unidades. Quer 100?");
  assert.equal(result.rounds, 3);
  assert.equal(result.exceededRounds, false);
  assert.equal(result.toolCalls[0].result.erro, "mínimo de 100");

  // A segunda chamada ao modelo já recebeu o resultado da primeira ferramenta.
  const second = seen[1];
  assert.equal(second.at(-1)?.role, "user");
  assert.deepEqual((second.at(-1)?.parts[0] as { functionResponse: { name: string } }).functionResponse.name, "adicionar_item");
});

test("limite de rodadas evita laço infinito", async () => {
  const forever: Partial<ModelTurn> = { functionCalls: [{ name: "ver_carrinho", args: {} }] };
  const { model } = scriptedModel(Array(20).fill(forever));
  const result = await runAgentLoop({ model, history: [], runTool: async () => ({ ok: true }), maxRounds: 4 });
  assert.equal(result.exceededRounds, true);
  assert.equal(result.reply, "");
  assert.equal(result.toolCalls.length, 4);
});

test("resposta vazia é permitida (resumo oficial já foi enviado)", async () => {
  const { model } = scriptedModel([{ text: "" }]);
  const result = await runAgentLoop({ model, history: [], runTool: async () => ({}) });
  assert.equal(result.reply, "");
  assert.equal(result.exceededRounds, false);
});

test("histórico: junta falas seguidas e sempre começa pelo cliente", () => {
  const contents = historyToContents([
    { kind: "out", content: "Oi! Posso ajudar?" },
    { kind: "in", content: "oi" },
    { kind: "in", content: "quero um cento" },
    { kind: "in", content: "   " },
    { kind: "out", content: "Claro!" },
    { kind: "in", content: "de coxinha" },
  ]);
  assert.deepEqual(contents.map((item) => item.role), ["user", "model", "user"]);
  assert.deepEqual(contents[0].parts, [{ text: "oi" }, { text: "quero um cento" }]);
});

test("batcher: mensagens em rajada viram um único turno depois do silêncio", async () => {
  const flushed: string[][] = [];
  const batcher = createBatcher<string>({ quietMs: 60, maxWaitMs: 500, onFlush: async (_key, items) => { flushed.push(items); } });

  batcher.push("a", "oi");
  await sleep(30);
  batcher.push("a", "quero um cento");
  await sleep(30);
  batcher.push("a", "de coxinha");
  assert.equal(flushed.length, 0, "ainda esperando o silêncio");
  await sleep(120);

  assert.deepEqual(flushed, [["oi", "quero um cento", "de coxinha"]]);
  assert.equal(batcher.pending(), 0);
});

test("batcher: conversas diferentes são independentes", async () => {
  const flushed: Array<[string, string[]]> = [];
  const batcher = createBatcher<string>({ quietMs: 30, maxWaitMs: 200, onFlush: async (key, items) => { flushed.push([key, items]); } });
  batcher.push("maria", "oi");
  batcher.push("joao", "bom dia");
  await sleep(90);
  assert.deepEqual(flushed.map(([key]) => key).sort(), ["joao", "maria"]);
});

test("batcher: espera máxima corta uma rajada sem fim", async () => {
  const flushed: string[][] = [];
  const batcher = createBatcher<string>({ quietMs: 80, maxWaitMs: 150, onFlush: async (_key, items) => { flushed.push(items); } });
  for (let i = 0; i < 6; i += 1) {
    batcher.push("a", String(i));
    await sleep(40);
  }
  await sleep(200);
  assert.ok(flushed.length >= 2, "o lote foi cortado pela espera máxima");
  assert.deepEqual(flushed.flat(), ["0", "1", "2", "3", "4", "5"]);
});

test("batcher: mensagem que chega durante o processamento vai para o lote seguinte, sem turnos simultâneos", async () => {
  let running = 0;
  let maxRunning = 0;
  const flushed: string[][] = [];
  const batcher = createBatcher<string>({
    quietMs: 20,
    maxWaitMs: 200,
    onFlush: async (_key, items) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      flushed.push(items);
      await sleep(80);
      running -= 1;
    },
  });

  batcher.push("a", "primeira");
  await sleep(40); // turno 1 começou
  batcher.push("a", "segunda");
  await sleep(250);

  assert.deepEqual(flushed, [["primeira"], ["segunda"]]);
  assert.equal(maxRunning, 1);
});

test("batcher: erro em um turno não trava a conversa", async () => {
  const errors: unknown[] = [];
  const flushed: string[][] = [];
  let first = true;
  const batcher = createBatcher<string>({
    quietMs: 10,
    maxWaitMs: 100,
    onFlush: async (_key, items) => {
      if (first) { first = false; throw new Error("falhou"); }
      flushed.push(items);
    },
    onError: (_key, error) => errors.push(error),
  });
  batcher.push("a", "um");
  await sleep(50);
  batcher.push("a", "dois");
  await sleep(50);
  assert.equal(errors.length, 1);
  assert.deepEqual(flushed, [["dois"]]);
});
