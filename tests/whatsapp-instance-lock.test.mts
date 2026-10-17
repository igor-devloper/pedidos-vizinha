import assert from "node:assert/strict";
import test from "node:test";

process.env.BOT_API_KEY ??= "test";
const { InstanceLock } = await import("../services/whatsapp-bot/src/instance-lock.js");
type LockStore = import("../services/whatsapp-bot/src/instance-lock.js").LockStore;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Reproduz a semântica do SQL: adquire se livre, expirada ou do mesmo dono.
function memoryLockStore() {
  const locks = new Map<string, { owner: string; expiresAt: number }>();
  const state = { failing: false };
  const store: LockStore = {
    async tryAcquire(instanceId, owner, ttlMs) {
      if (state.failing) throw new Error("db fora do ar");
      const current = locks.get(instanceId);
      if (current && current.owner !== owner && current.expiresAt > Date.now()) return false;
      locks.set(instanceId, { owner, expiresAt: Date.now() + ttlMs });
      return true;
    },
    async release(instanceId, owner) {
      if (locks.get(instanceId)?.owner === owner) locks.delete(instanceId);
    },
  };
  return { store, state, locks };
}

const options = { ttlMs: 200, renewEveryMs: 40 };

test("só um processo segura a trava; o segundo espera até o primeiro soltar", async () => {
  const { store } = memoryLockStore();
  const a = new InstanceLock(store, "i1", "A", options, () => assert.fail("A não devia perder"));
  const b = new InstanceLock(store, "i1", "B", options, () => undefined);

  assert.equal(await a.tryAcquire(), true);
  assert.equal(await b.tryAcquire(), false);

  await a.release();
  assert.equal(await b.tryAcquire(), true);
  await b.release();
});

test("a renovação mantém a trava além do TTL", async () => {
  const { store } = memoryLockStore();
  const a = new InstanceLock(store, "i1", "A", options, () => assert.fail("não devia perder"));
  const b = new InstanceLock(store, "i1", "B", options, () => undefined);

  assert.equal(await a.tryAcquire(), true);
  await sleep(options.ttlMs * 2);
  assert.equal(await b.tryAcquire(), false);
  await a.release();
});

test("processo que morreu sem soltar perde a trava após o TTL", async () => {
  const { store, locks } = memoryLockStore();
  locks.set("i1", { owner: "morto", expiresAt: Date.now() + options.ttlMs });
  const b = new InstanceLock(store, "i1", "B", options, () => undefined);

  assert.equal(await b.tryAcquire(), false);
  await sleep(options.ttlMs + 20);
  assert.equal(await b.tryAcquire(), true);
  await b.release();
});

test("se outro processo tomar a trava, o dono antigo é avisado", async () => {
  const { store, locks } = memoryLockStore();
  let lostReason = "";
  const a = new InstanceLock(store, "i1", "A", options, (reason) => (lostReason = reason));

  assert.equal(await a.tryAcquire(), true);
  locks.set("i1", { owner: "B", expiresAt: Date.now() + 10_000 });
  await sleep(options.renewEveryMs * 3);

  assert.match(lostReason, /another process/);
  assert.equal(a.isHeld, false);
});

test("banco fora do ar: tolera falha curta, mas desiste antes de a trava expirar", async () => {
  const { store, state } = memoryLockStore();
  let lost = 0;
  const a = new InstanceLock(store, "i1", "A", options, () => lost++);

  assert.equal(await a.tryAcquire(), true);
  state.failing = true;
  await sleep(options.renewEveryMs * 2);
  assert.equal(lost, 0, "falha curta não derruba");

  await sleep(options.ttlMs);
  assert.equal(lost, 1);
  assert.equal(a.isHeld, false);
});
