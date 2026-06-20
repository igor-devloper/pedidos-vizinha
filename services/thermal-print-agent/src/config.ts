import "dotenv/config";

function readRequired(key: string) {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }

  return value;
}

function readOptional(key: string, fallback: string) {
  return process.env[key]?.trim() || fallback;
}

export const config = {
  printServiceUrl: readRequired("PRINT_SERVICE_URL").replace(/\/$/, ""),
  printServiceApiKey: readRequired("PRINT_SERVICE_API_KEY").replace(/^Bearer\s+/i, ""),
  printerName: readOptional("PRINTER_NAME", ""),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 5000),
  printedStateFile: readOptional("PRINTED_STATE_FILE", "./data/printed-jobs.json"),
  printCommand: process.env.PRINT_COMMAND?.trim() || "",
};
