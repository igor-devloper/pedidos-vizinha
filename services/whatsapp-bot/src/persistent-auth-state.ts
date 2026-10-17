import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";

import type { AuthBlobStore } from "./auth-blob-store.js";

const CREDS_KEY = "creds";

export const serializeAuthValue = (value: unknown) =>
  JSON.stringify(value, BufferJSON.replacer);

export const parseAuthValue = (raw: string) => JSON.parse(raw, BufferJSON.reviver);

export const signalKey = (type: string, id: string) => `${type}:${id}`;

export type PersistentAuthState = {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  /** Resolve quando todas as gravações pendentes terminaram (usar no desligamento). */
  flush: () => Promise<void>;
};

/**
 * Auth state do Baileys sobre um AuthBlobStore (Postgres em produção).
 * Gravações são enfileiradas em ordem, então a última versão de cada chave sempre vence,
 * e cada lote de chaves é gravado de forma atômica.
 */
export async function usePersistentAuthState(
  store: AuthBlobStore,
  instanceId: string
): Promise<PersistentAuthState> {
  const stored = (await store.getMany(instanceId, [CREDS_KEY])).get(CREDS_KEY);
  const creds: AuthenticationCreds = stored
    ? (parseAuthValue(stored) as AuthenticationCreds)
    : initAuthCreds();

  let queue: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>) => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const keys = ids.map((id) => signalKey(type, id));
          const rows = await store.getMany(instanceId, keys);
          const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};

          for (const id of ids) {
            const raw = rows.get(signalKey(type, id));
            let value = raw ? parseAuthValue(raw) : null;
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }

          return data;
        },
        set: (data) => {
          const upserts: Array<[string, string]> = [];
          const deletes: string[] = [];

          for (const type of Object.keys(data)) {
            const entries = data[type as keyof SignalDataTypeMap] ?? {};
            for (const [id, value] of Object.entries(entries)) {
              const key = signalKey(type, id);
              if (value) {
                upserts.push([key, serializeAuthValue(value)]);
              } else {
                deletes.push(key);
              }
            }
          }

          return enqueue(() => store.apply(instanceId, upserts, deletes));
        },
      },
    },
    saveCreds: () =>
      enqueue(() =>
        store.apply(
          instanceId,
          [[CREDS_KEY, serializeAuthValue(creds)]],
          []
        )
      ),
    flush: () => queue,
  };
}
