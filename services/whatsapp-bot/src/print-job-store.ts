import { appendFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { config } from "./config.js";
import { ensureParent } from "./fs-utils.js";

export type PrintJobInput = {
  orderId: string;
  code: string;
  reason: "auto-accepted" | "manual";
  printer: {
    model: string;
    widthMm: number;
    dpi: number;
    commandSet: string;
  };
  receipt: string;
  order?: {
    customerName?: string;
    customerPhone?: string;
    deliveryAt?: string;
    productName?: string;
    total?: number;
  };
};

export type PrintJob = PrintJobInput & {
  id: string;
  createdAt: string;
  status: "queued";
};

export async function createPrintJob(input: PrintJobInput) {
  await ensureParent(config.printJobsFile);

  const job: PrintJob = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "queued",
  };

  await appendFile(config.printJobsFile, `${JSON.stringify(job)}\n`, "utf8");

  return job;
}

export async function listPrintJobs(limit = 20) {
  await ensureParent(config.printJobsFile);

  const raw = await readFile(config.printJobsFile, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return "";
    }

    throw error;
  });

  return raw
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line) as PrintJob)
    .reverse();
}
