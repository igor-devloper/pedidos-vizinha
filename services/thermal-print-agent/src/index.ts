import { z } from "zod";

import { config } from "./config.js";
import { printJob } from "./print.js";
import { loadPrintedJobIds, savePrintedJobIds } from "./state.js";
import type { PrintJob } from "./types.js";

const printJobsResponseSchema = z.object({
  ok: z.boolean(),
  jobs: z.array(
    z.object({
      id: z.string(),
      orderId: z.string(),
      code: z.string(),
      reason: z.enum(["auto-accepted", "manual"]),
      createdAt: z.string(),
      status: z.literal("queued"),
      receipt: z.string(),
      printer: z.object({
        model: z.string(),
        widthMm: z.number(),
        dpi: z.number(),
        commandSet: z.string(),
      }),
    })
  ),
});

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPrintJobs() {
  const response = await fetch(`${config.printServiceUrl}/print-jobs?limit=50`, {
    headers: {
      Authorization: `Bearer ${config.printServiceApiKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Print service returned ${response.status}: ${details}`);
  }

  const data = printJobsResponseSchema.parse(await response.json());
  return data.jobs as PrintJob[];
}

async function runOnce(printedIds: Set<string>) {
  const jobs = await fetchPrintJobs();
  const pendingJobs = jobs
    .filter((job) => !printedIds.has(job.id))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const job of pendingJobs) {
    console.log(`Printing pedido ${job.code} (${job.reason})`);
    await printJob(job);
    printedIds.add(job.id);
    await savePrintedJobIds(printedIds);
    console.log(`Printed pedido ${job.code}`);
  }
}

async function main() {
  console.log("Vizinha thermal print agent started");
  console.log(`Print service: ${config.printServiceUrl}`);
  console.log(`Printer: ${config.printerName || "default printer"}`);

  const printedIds = await loadPrintedJobIds();

  while (true) {
    try {
      await runOnce(printedIds);
    } catch (error) {
      console.error("Print agent cycle failed", error);
    }

    await delay(config.pollIntervalMs);
  }
}

void main();
