import assert from "node:assert/strict";
import test from "node:test";
import { getInternalOrderKeys, requestWhatsappOrder } from "../services/whatsapp-bot/src/internal-order-client.js";

test("normaliza Bearer e remove chaves duplicadas sem aceitar chave vazia", () => {
  assert.deepEqual(getInternalOrderKeys({ INTERNAL_ORDER_API_KEY: " Bearer shared ", BOT_API_KEY: "shared", BOT_SERVICE_API_KEY: " " }), ["shared"]);
  assert.deepEqual(getInternalOrderKeys({}), []);
});

test("401 tenta a outra chave configurada e mantém o mesmo draft", async () => {
  const requests: RequestInit[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    requests.push(init!);
    return requests.length === 1 ? new Response("Unauthorized", { status: 401 }) : Response.json({ order: { id: "o1" }, pixCopyPaste: "pix" });
  };
  const result = await requestWhatsappOrder("https://store.example", ["old", "shared"], "draft-1", false, fetcher);
  assert.equal(result.ok, true);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((r) => JSON.parse(String(r.body))), [{ draftId: "draft-1", preview: false }, { draftId: "draft-1", preview: false }]);
  assert.equal(new Headers(requests[1].headers).get("authorization"), "Bearer shared");
});

test("erro de pagamento não repete cobrança com outra chave", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ error: "Falha no provedor" }, { status: 502 }); };
  const result = await requestWhatsappOrder("https://store.example", ["a", "b"], "draft-1", false, fetcher);
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
});

test("resumo solicita apenas preview e respostas inválidas são controladas", async () => {
  const fetcher: typeof fetch = async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).preview, true);
    return new Response("Bad gateway", { status: 502 });
  };
  const result = await requestWhatsappOrder("https://store.example", ["shared"], "draft-1", true, fetcher);
  assert.equal(result.data, null);
  assert.equal(result.status, 502);
});
