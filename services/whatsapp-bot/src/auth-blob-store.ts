import { db } from "./db.js";
import { ensureWaSchema } from "./wa-schema.js";

/**
 * Armazenamento chave/valor (texto) da sessão do WhatsApp, por instância.
 * `apply` é atômico: upserts e deletes entram juntos ou nenhum entra.
 */
export type AuthBlobStore = {
  getMany(instanceId: string, keys: string[]): Promise<Map<string, string>>;
  apply(
    instanceId: string,
    upserts: Array<[key: string, value: string]>,
    deletes: string[]
  ): Promise<void>;
  clear(instanceId: string): Promise<void>;
};

export function createPgAuthBlobStore(): AuthBlobStore {
  if (!db) {
    throw new Error("DATABASE_URL is required for the Postgres auth store");
  }
  const pool = db;

  return {
    async getMany(instanceId, keys) {
      const result = new Map<string, string>();
      if (keys.length === 0) {
        return result;
      }

      await ensureWaSchema();
      const { rows } = await pool.query<{ key: string; value: string }>(
        `SELECT "key", "value" FROM "wa_auth"
         WHERE "instance_id" = $1::text AND "key" = ANY($2::text[])`,
        [instanceId, keys]
      );
      for (const row of rows) {
        result.set(row.key, row.value);
      }
      return result;
    },

    async apply(instanceId, upserts, deletes) {
      if (upserts.length === 0 && deletes.length === 0) {
        return;
      }

      await ensureWaSchema();
      // Um único statement com CTE de DELETE: Postgres executa tudo de forma atômica.
      await pool.query(
        `WITH removed AS (
           DELETE FROM "wa_auth"
           WHERE "instance_id" = $1::text AND "key" = ANY($2::text[])
           RETURNING 1
         )
         INSERT INTO "wa_auth" ("instance_id", "key", "value", "updated_at")
         SELECT $1::text, t.k, t.v, now()
         FROM unnest($3::text[], $4::text[]) AS t(k, v)
         ON CONFLICT ("instance_id", "key")
         DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = now()`,
        [
          instanceId,
          deletes,
          upserts.map(([key]) => key),
          upserts.map(([, value]) => value),
        ]
      );
    },

    async clear(instanceId) {
      await ensureWaSchema();
      await pool.query(`DELETE FROM "wa_auth" WHERE "instance_id" = $1::text`, [
        instanceId,
      ]);
    },
  };
}
