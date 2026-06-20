import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { config } from "./config.js";
import type { PrintJob } from "./types.js";

const execFileAsync = promisify(execFile);
const RECEIPT_COLUMNS = 38;
const RECEIPT_FONT_SIZE = 10;

const windowsThermalPrintScript = String.raw`
param(
  [Parameter(Mandatory=$true)][string]$ReceiptFile,
  [string]$PrinterName = "",
  [int]$WidthMm = 58,
  [string]$FontName = "Consolas",
  [single]$FontSize = 10
)

Add-Type -AssemblyName System.Drawing

$text = [System.IO.File]::ReadAllText($ReceiptFile, [System.Text.Encoding]::UTF8)
$lines = $text -split "\r?\n"

$doc = New-Object System.Drawing.Printing.PrintDocument
if ($PrinterName) {
  $doc.PrinterSettings.PrinterName = $PrinterName
}

if (-not $doc.PrinterSettings.IsValid) {
  throw "Printer not found or not available: $PrinterName"
}

$paperWidth = [int][Math]::Round(($WidthMm / 25.4) * 100)
$estimatedLineHeight = [int][Math]::Ceiling(($FontSize / 72) * 100 * 1.45)
$paperHeight = [Math]::Max(400, ($lines.Count * $estimatedLineHeight) + 80)

$doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize("Receipt58", $paperWidth, $paperHeight)
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$doc.OriginAtMargins = $false
$doc.DocumentName = "Vizinha pedido"

$font = New-Object System.Drawing.Font($FontName, $FontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
$boldFont = New-Object System.Drawing.Font($FontName, $FontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
$brush = [System.Drawing.Brushes]::Black
$script:lineIndex = 0

$doc.add_PrintPage({
  param($sender, $event)

  $event.Graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
  $x = 4
  $y = 4
  $lineHeight = [Math]::Ceiling($font.GetHeight($event.Graphics) + 2)
  $maxY = $event.PageBounds.Height - 8

  while ($script:lineIndex -lt $lines.Count) {
    $line = $lines[$script:lineIndex]
    $currentFont = if ($line.StartsWith("#") -or $line.StartsWith("TOTAL")) { $boldFont } else { $font }
    $printLine = if ($line.StartsWith("#")) { $line.Substring(1) } else { $line }

    $event.Graphics.DrawString($printLine, $currentFont, $brush, $x, $y)
    $y += $lineHeight
    $script:lineIndex += 1

    if ($y + $lineHeight -gt $maxY -and $script:lineIndex -lt $lines.Count) {
      $event.HasMorePages = $true
      return
    }
  }

  $event.HasMorePages = $false
})

$doc.Print()
$font.Dispose()
$boldFont.Dispose()
$doc.Dispose()
`;

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function wrapLine(line: string, columns = RECEIPT_COLUMNS) {
  const trimmed = stripDiacritics(line).trimEnd();

  if (!trimmed || trimmed.length <= columns) {
    return [trimmed];
  }

  const output: string[] = [];
  let current = trimmed;

  while (current.length > columns) {
    let breakAt = current.lastIndexOf(" ", columns);

    if (breakAt < Math.floor(columns * 0.6)) {
      breakAt = columns;
    }

    output.push(current.slice(0, breakAt).trimEnd());
    current = current.slice(breakAt).trimStart();
  }

  if (current) {
    output.push(current);
  }

  return output;
}

function normalizeReceipt(receipt: string) {
  return receipt
    .trim()
    .split(/\r?\n/)
    .flatMap((line) => wrapLine(line))
    .join("\n");
}

async function buildWindowsThermalPrintCommand(file: string, widthMm: number, folder: string) {
  const scriptFile = join(folder, "print-receipt.ps1");
  await writeFile(scriptFile, windowsThermalPrintScript.trimStart(), "utf8");

  return {
    command: "powershell",
    args: [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptFile,
      "-ReceiptFile",
      file,
      "-PrinterName",
      config.printerName,
      "-WidthMm",
      String(widthMm),
      "-FontSize",
      String(RECEIPT_FONT_SIZE),
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

async function buildDefaultPrintCommand(file: string, job: PrintJob, folder: string) {
  if (process.platform === "win32") {
    return buildWindowsThermalPrintCommand(file, job.printer.widthMm || 58, folder);
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
  await writeFile(file, `${normalizeReceipt(job.receipt)}\n\n\n`, "utf8");

  const command = buildCustomPrintCommand(file) || await buildDefaultPrintCommand(file, job, folder);
  await execFileAsync(command.command, command.args, {
    windowsHide: true,
    timeout: 30000,
  });
}
