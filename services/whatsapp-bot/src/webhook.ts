import { config } from "./config.js";
import { instanceStore } from "./instance-store.js";
import { logger } from "./logger.js";
import type { InboundMessageJob } from "./types.js";

export async function emitWebhook(job: InboundMessageJob) {
  const instance = await instanceStore.get(job.instanceId);
  const target = instance?.webhookUrl || config.webhookUrl;

  if (!target) {
    return;
  }

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-instance-id": job.instanceId,
      },
      body: JSON.stringify({
        type: "message.received",
        data: job,
      }),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status, instanceId: job.instanceId },
        "Webhook returned non-2xx status"
      );
    }
  } catch (error) {
    logger.error({ error, instanceId: job.instanceId }, "Webhook dispatch failed");
  }
}
