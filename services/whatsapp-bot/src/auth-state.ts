import { useMultiFileAuthState } from "@whiskeysockets/baileys";

import { getInstanceAuthPath } from "./auth-paths.js";
import { createPgAuthBlobStore, type AuthBlobStore } from "./auth-blob-store.js";
import { db } from "./db.js";
import { importFileAuthIfNeeded } from "./file-auth-import.js";
import { ensureDir, removeDir } from "./fs-utils.js";
import { logger } from "./logger.js";
import { usePersistentAuthState, type PersistentAuthState } from "./persistent-auth-state.js";

export type OpenedAuthState = PersistentAuthState & {
  /** Apaga a sessão (só usar em loggedOut, logout explícito ou exclusão da instância). */
  clear: () => Promise<void>;
};

let pgStore: AuthBlobStore | null = null;

/**
 * Produção (DATABASE_URL): sessão no Postgres. Sem banco (dev local): pasta em disco.
 * Na primeira abertura, uma pasta de sessão antiga é importada para o banco.
 */
export async function openAuthState(instanceId: string): Promise<OpenedAuthState> {
  const folder = getInstanceAuthPath(instanceId);

  if (!db) {
    await ensureDir(folder);
    const { state, saveCreds } = await useMultiFileAuthState(folder);
    return {
      state,
      saveCreds,
      flush: async () => undefined,
      clear: () => removeDir(folder),
    };
  }

  pgStore ??= createPgAuthBlobStore();
  const store = pgStore;

  const imported = await importFileAuthIfNeeded(store, instanceId, folder);
  if (imported.imported) {
    logger.info({ instanceId, keys: imported.keys }, "Imported file-based WhatsApp session into Postgres");
  }

  const auth = await usePersistentAuthState(store, instanceId);
  return {
    ...auth,
    clear: async () => {
      await auth.flush().catch(() => undefined);
      await store.clear(instanceId);
      await removeDir(folder);
    },
  };
}
