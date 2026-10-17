import { randomUUID } from "node:crypto";

import { config } from "./config.js";
import { db } from "./db.js";
import { readJson, writeJson } from "./fs-utils.js";
import { logger } from "./logger.js";
import type { InstanceRecord } from "./types.js";
import { ensureWaSchema } from "./wa-schema.js";

type InstanceCreateInput = {
  name: string;
  phoneNumber?: string;
  webhookUrl?: string;
};

// Produção: tabela wa_instance (sobrevive a deploys). Sem DATABASE_URL (dev local): arquivo JSON.
class InstanceStore {
  private ready: Promise<void> | null = null;

  private ensureReady() {
    if (!db) {
      return Promise.resolve();
    }

    const pool = db;
    this.ready ??= (async () => {
      await ensureWaSchema();
      const { rows } = await pool.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM "wa_instance"`
      );
      if (rows[0]?.total !== "0") {
        return;
      }

      const legacy = await readJson<InstanceRecord[]>(config.instanceFile, []);
      for (const record of legacy) {
        await pool.query(
          `INSERT INTO "wa_instance" ("id", "data") VALUES ($1::text, $2::jsonb)
           ON CONFLICT ("id") DO NOTHING`,
          [record.id, JSON.stringify(record)]
        );
      }
      if (legacy.length > 0) {
        logger.info({ count: legacy.length }, "Imported instances.json into wa_instance");
      }
    })().catch((error) => {
      this.ready = null;
      throw error;
    });

    return this.ready;
  }

  async list(): Promise<InstanceRecord[]> {
    if (!db) {
      return readJson<InstanceRecord[]>(config.instanceFile, []);
    }

    await this.ensureReady();
    const { rows } = await db.query<{ data: InstanceRecord }>(
      `SELECT "data" FROM "wa_instance" ORDER BY "created_at"`
    );
    return rows.map((row) => row.data);
  }

  async get(instanceId: string) {
    if (!db) {
      const items = await this.list();
      return items.find((item) => item.id === instanceId) || null;
    }

    await this.ensureReady();
    const { rows } = await db.query<{ data: InstanceRecord }>(
      `SELECT "data" FROM "wa_instance" WHERE "id" = $1::text`,
      [instanceId]
    );
    return rows[0]?.data ?? null;
  }

  async create(input: InstanceCreateInput) {
    const now = new Date().toISOString();
    const record: InstanceRecord = {
      id: randomUUID(),
      name: input.name,
      phoneNumber: input.phoneNumber,
      webhookUrl: input.webhookUrl,
      status: "idle",
      createdAt: now,
      updatedAt: now,
    };

    if (!db) {
      const items = await this.list();
      items.push(record);
      await writeJson(config.instanceFile, items);
      return record;
    }

    await this.ensureReady();
    await db.query(`INSERT INTO "wa_instance" ("id", "data") VALUES ($1::text, $2::jsonb)`, [
      record.id,
      JSON.stringify(record),
    ]);
    return record;
  }

  async update(instanceId: string, patch: Partial<InstanceRecord>) {
    const stamped = { ...patch, updatedAt: new Date().toISOString() };

    if (!db) {
      const items = await this.list();
      const index = items.findIndex((item) => item.id === instanceId);
      if (index === -1) {
        return null;
      }

      items[index] = { ...items[index], ...stamped };
      await writeJson(config.instanceFile, items);
      return items[index];
    }

    await this.ensureReady();
    // `undefined` vira null no merge e jsonb_strip_nulls remove a chave (limpar um campo).
    const nulled = Object.fromEntries(
      Object.entries(stamped).map(([key, value]) => [key, value === undefined ? null : value])
    );
    const { rows } = await db.query<{ data: InstanceRecord }>(
      `UPDATE "wa_instance"
       SET "data" = jsonb_strip_nulls("data" || $2::jsonb), "updated_at" = now()
       WHERE "id" = $1::text
       RETURNING "data"`,
      [instanceId, JSON.stringify(nulled)]
    );
    return rows[0]?.data ?? null;
  }

  async remove(instanceId: string) {
    if (!db) {
      const items = await this.list();
      const next = items.filter((item) => item.id !== instanceId);
      const changed = next.length !== items.length;
      if (changed) {
        await writeJson(config.instanceFile, next);
      }
      return changed;
    }

    await this.ensureReady();
    const { rows } = await db.query<{ id: string }>(
      `DELETE FROM "wa_instance" WHERE "id" = $1::text RETURNING "id"`,
      [instanceId]
    );
    return rows.length > 0;
  }
}

export const instanceStore = new InstanceStore();
