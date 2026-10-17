import { db } from "./db.js";
import { ensureWaSchema } from "./wa-schema.js";

/** Trava com TTL: só um processo por vez pode manter o socket de uma instância. */
export type LockStore = {
  /** Adquire a trava ou renova se já for do `owner`. Falso se outro dono ainda a segura. */
  tryAcquire(instanceId: string, owner: string, ttlMs: number): Promise<boolean>;
  release(instanceId: string, owner: string): Promise<void>;
};

export function createPgLockStore(): LockStore {
  if (!db) {
    throw new Error("DATABASE_URL is required for the Postgres lock store");
  }
  const pool = db;

  return {
    async tryAcquire(instanceId, owner, ttlMs) {
      await ensureWaSchema();
      const { rows } = await pool.query<{ owner: string }>(
        `INSERT INTO "wa_lock" ("instance_id", "owner", "expires_at")
         VALUES ($1::text, $2::text, now() + make_interval(secs => $3::double precision))
         ON CONFLICT ("instance_id") DO UPDATE
           SET "owner" = EXCLUDED."owner", "expires_at" = EXCLUDED."expires_at"
           WHERE "wa_lock"."owner" = EXCLUDED."owner" OR "wa_lock"."expires_at" < now()
         RETURNING "owner"`,
        [instanceId, owner, ttlMs / 1000]
      );
      return rows.length > 0;
    },

    async release(instanceId, owner) {
      await ensureWaSchema();
      await pool.query(`DELETE FROM "wa_lock" WHERE "instance_id" = $1::text AND "owner" = $2::text`, [
        instanceId,
        owner,
      ]);
    },
  };
}

export type InstanceLockOptions = {
  ttlMs: number;
  renewEveryMs: number;
};

export class InstanceLock {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRenewedAt = 0;
  private held = false;

  constructor(
    private readonly store: LockStore,
    private readonly instanceId: string,
    readonly owner: string,
    private readonly options: InstanceLockOptions,
    private readonly onLost: (reason: string) => void
  ) {}

  get isHeld() {
    return this.held;
  }

  async tryAcquire() {
    const acquired = await this.store.tryAcquire(this.instanceId, this.owner, this.options.ttlMs);
    if (!acquired) {
      return false;
    }

    this.held = true;
    this.lastRenewedAt = Date.now();
    this.timer ??= setInterval(() => void this.renew(), this.options.renewEveryMs);
    this.timer.unref?.();
    return true;
  }

  private async renew() {
    if (!this.held) {
      return;
    }

    try {
      const ok = await this.store.tryAcquire(this.instanceId, this.owner, this.options.ttlMs);
      if (ok) {
        this.lastRenewedAt = Date.now();
        return;
      }
      this.lose("another process took the lock");
    } catch (error) {
      // Banco indisponível: só desiste quando não dá mais para garantir que a trava é nossa.
      if (Date.now() - this.lastRenewedAt >= this.options.ttlMs - this.options.renewEveryMs) {
        this.lose(`could not renew lock (${error instanceof Error ? error.message : "error"})`);
      }
    }
  }

  private lose(reason: string) {
    if (!this.held) {
      return;
    }

    this.stopTimer();
    this.held = false;
    this.onLost(reason);
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async release() {
    this.stopTimer();
    if (!this.held) {
      return;
    }

    this.held = false;
    await this.store.release(this.instanceId, this.owner).catch(() => undefined);
  }
}

/** Sem banco (dev local) há um único processo: a trava é sempre concedida. */
export function createLocalLockStore(): LockStore {
  return {
    async tryAcquire() {
      return true;
    },
    async release() {},
  };
}
