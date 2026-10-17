import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { AuthBlobStore } from "./auth-blob-store.js";
import { signalKey } from "./persistent-auth-state.js";

// Tipos de chave do Baileys cujo nome de arquivo (`<tipo>-<id>.json`) dá para reverter sem
// ambiguidade. `sender-key*` ficam de fora: o id tem `:` que o Baileys trocou por `-`, e o
// WhatsApp reenvia essas chaves de grupo sozinho (o bot ignora grupos).
const IMPORTABLE_TYPES = [
  "app-state-sync-key",
  "app-state-sync-version",
  "device-list",
  "lid-mapping",
  "pre-key",
  "session",
  "tctoken",
];

export type FileAuthImportResult = {
  imported: boolean;
  keys: number;
  reason?: "already-in-store" | "no-local-creds";
};

/**
 * Migra uma sessão antiga em pasta (useMultiFileAuthState) para o store, uma única vez.
 * Não faz nada se o store já tiver credenciais para a instância.
 */
export async function importFileAuthIfNeeded(
  store: AuthBlobStore,
  instanceId: string,
  folder: string
): Promise<FileAuthImportResult> {
  const existing = await store.getMany(instanceId, ["creds"]);
  if (existing.has("creds")) {
    return { imported: false, keys: 0, reason: "already-in-store" };
  }

  let credsRaw: string;
  try {
    credsRaw = await readFile(path.join(folder, "creds.json"), "utf8");
    JSON.parse(credsRaw);
  } catch {
    return { imported: false, keys: 0, reason: "no-local-creds" };
  }

  const upserts: Array<[string, string]> = [["creds", credsRaw]];
  const files = await readdir(folder).catch(() => [] as string[]);

  for (const file of files) {
    if (!file.endsWith(".json") || file === "creds.json") {
      continue;
    }

    const name = file.slice(0, -".json".length);
    const type = IMPORTABLE_TYPES.find((candidate) => name.startsWith(`${candidate}-`));
    if (!type) {
      continue;
    }

    const id = name.slice(type.length + 1).replace(/__/g, "/");
    try {
      const content = await readFile(path.join(folder, file), "utf8");
      JSON.parse(content);
      upserts.push([signalKey(type, id), content]);
    } catch {
      // arquivo corrompido: o Baileys regenera a chave quando precisar
    }
  }

  await store.apply(instanceId, upserts, []);
  return { imported: true, keys: upserts.length };
}
