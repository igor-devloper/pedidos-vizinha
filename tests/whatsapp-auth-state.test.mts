import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { AuthBlobStore } from "../services/whatsapp-bot/src/auth-blob-store.js";
import { importFileAuthIfNeeded } from "../services/whatsapp-bot/src/file-auth-import.js";
import { parseAuthValue, serializeAuthValue, usePersistentAuthState } from "../services/whatsapp-bot/src/persistent-auth-state.js";

function memoryStore() {
  const data = new Map<string, string>();
  const calls: Array<{ upserts: number; deletes: number }> = [];
  const store: AuthBlobStore = {
    async getMany(instanceId, keys) {
      const out = new Map<string, string>();
      for (const key of keys) {
        const value = data.get(`${instanceId}|${key}`);
        if (value !== undefined) out.set(key, value);
      }
      return out;
    },
    async apply(instanceId, upserts, deletes) {
      calls.push({ upserts: upserts.length, deletes: deletes.length });
      for (const key of deletes) data.delete(`${instanceId}|${key}`);
      for (const [key, value] of upserts) data.set(`${instanceId}|${key}`, value);
    },
    async clear(instanceId) {
      for (const key of [...data.keys()]) if (key.startsWith(`${instanceId}|`)) data.delete(key);
    },
  };
  return { store, data, calls };
}

test("creds e chaves sobrevivem a um novo processo (Buffers incluídos)", async () => {
  const { store } = memoryStore();

  const first = await usePersistentAuthState(store, "i1");
  const noiseKey = first.state.creds.noiseKey.private;
  assert.ok(Buffer.isBuffer(noiseKey) || noiseKey instanceof Uint8Array);

  await first.state.keys.set({
    "pre-key": { "7": { private: Buffer.from("priv"), public: Buffer.from("pub") } },
    session: { "5583.0": Buffer.from("sessao") },
  });
  await first.saveCreds();
  await first.flush();

  const second = await usePersistentAuthState(store, "i1");
  assert.deepEqual(
    Buffer.from(second.state.creds.noiseKey.private),
    Buffer.from(noiseKey)
  );
  assert.equal(second.state.creds.registrationId, first.state.creds.registrationId);

  const preKeys = await second.state.keys.get("pre-key", ["7", "8"]);
  assert.equal(Buffer.from(preKeys["7"].private).toString(), "priv");
  assert.equal(preKeys["8"], null);

  const sessions = await second.state.keys.get("session", ["5583.0"]);
  assert.equal(Buffer.from(sessions["5583.0"]).toString(), "sessao");
});

test("valor nulo remove a chave e instâncias não se misturam", async () => {
  const { store } = memoryStore();
  const a = await usePersistentAuthState(store, "a");
  const b = await usePersistentAuthState(store, "b");

  await a.state.keys.set({ session: { x: Buffer.from("1") } });
  await b.state.keys.set({ session: { x: Buffer.from("2") } });
  await a.state.keys.set({ session: { x: null } });

  assert.equal((await a.state.keys.get("session", ["x"])).x, null);
  assert.equal(Buffer.from((await b.state.keys.get("session", ["x"])).x).toString(), "2");
});

test("gravações concorrentes são aplicadas em ordem: a última vence", async () => {
  const { store, data } = memoryStore();
  const auth = await usePersistentAuthState(store, "i1");

  void auth.state.keys.set({ session: { k: Buffer.from("v1") } });
  void auth.state.keys.set({ session: { k: Buffer.from("v2") } });
  await auth.state.keys.set({ session: { k: Buffer.from("v3") } });
  await auth.flush();

  const raw = data.get("i1|session:k");
  assert.equal(Buffer.from(parseAuthValue(raw!)).toString(), "v3");
});

test("uma falha de gravação não trava as próximas", async () => {
  const { store } = memoryStore();
  let fail = true;
  const flaky: AuthBlobStore = {
    ...store,
    async apply(...args) {
      if (fail) {
        fail = false;
        throw new Error("db fora do ar");
      }
      return store.apply(...args);
    },
  };

  const auth = await usePersistentAuthState(flaky, "i1");
  await assert.rejects(auth.saveCreds(), /db fora do ar/);
  await auth.saveCreds();
  assert.ok((await store.getMany("i1", ["creds"])).has("creds"));
});

test("importa a pasta antiga uma única vez e ignora sender-key", async () => {
  const { store } = memoryStore();
  const folder = await mkdtemp(path.join(tmpdir(), "wa-auth-"));
  const seed = await usePersistentAuthState(memoryStore().store, "seed");

  await writeFile(path.join(folder, "creds.json"), serializeAuthValue(seed.state.creds));
  await writeFile(path.join(folder, "pre-key-12.json"), JSON.stringify({ x: 1 }));
  await writeFile(path.join(folder, "session-5583__1.0.json"), JSON.stringify({ x: 2 }));
  await writeFile(path.join(folder, "sender-key-grupo--jid--0.json"), JSON.stringify({ x: 3 }));
  await writeFile(path.join(folder, "quebrado.json"), "{");

  const first = await importFileAuthIfNeeded(store, "i1", folder);
  assert.deepEqual(first, { imported: true, keys: 3 });
  assert.ok((await store.getMany("i1", ["pre-key:12"])).has("pre-key:12"));
  assert.ok((await store.getMany("i1", ["session:5583/1.0"])).has("session:5583/1.0"));

  const second = await importFileAuthIfNeeded(store, "i1", folder);
  assert.equal(second.imported, false);
  assert.equal(second.reason, "already-in-store");

  const none = await importFileAuthIfNeeded(store, "outra", path.join(folder, "nao-existe"));
  assert.equal(none.reason, "no-local-creds");
});
