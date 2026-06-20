import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { config } from "./config.js";
import type { PrintJob } from "./types.js";

const execFileAsync = promisify(execFile);

function quotePowerShell(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildWindowsPrintCommand(file: string) {
  const printerPart = config.printerName
    ? ` | Out-Printer -Name ${quotePowerShell(config.printerName)}`
    : " | Out-Printer";

  return {
    command: "powershell",
    args: [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Get-Content -Raw ${quotePowerShell(file)}${printerPart}`,
    ],
  };
}

function buildCustomPrintCommand(file: string) {
  if (!config.printCommand) {
    return null;
  }

  const expanded = config.printCommand
    .replaceAll("{file}", file)
    .replaceAll("{printer}", config.printerName);

  if (process.platform === "win32") {
    return {
      command: "cmd",
      args: ["/d", "/s", "/c", expanded],
    };
  }

  return {
    command: "sh",
    args: ["-lc", expanded],
  };
}

function buildDefaultPrintCommand(file: string) {
  if (process.platform === "win32") {
    return buildWindowsPrintCommand(file);
  }

  if (config.printerName) {
    return {
      command: "lp",
      args: ["-d", config.printerName, file],
    };
  }

  return {
    command: "lp",
    args: [file],
  };
}

export async function printJob(job: PrintJob) {
  const folder = await mkdtemp(join(tmpdir(), "vizinha-print-"));
  const file = join(folder, `pedido-${job.code}.txt`);
  await writeFile(file, `${job.receipt.trim()}\n\n\n`, "utf8");

  const command = buildCustomPrintCommand(file) || buildDefaultPrintCommand(file);
  await execFileAsync(command.command, command.args, {
    windowsHide: true,
    timeout: 30000,
  });
}
