import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { config } from "./config.js";

type PrintedState = {
  printedJobIds: string[];
};

export async function loadPrintedJobIds() {
  const raw = await readFile(config.printedStateFile, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return "";
    }

    throw error;
  });

  if (!raw) {
    return new Set<string>();
  }

  const state = JSON.parse(raw) as PrintedState;
  return new Set(state.printedJobIds || []);
}

export async function savePrintedJobIds(ids: Set<string>) {
  await mkdir(dirname(config.printedStateFile), { recursive: true });

  const state: PrintedState = {
    printedJobIds: Array.from(ids).slice(-1000),
  };

  await writeFile(config.printedStateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
