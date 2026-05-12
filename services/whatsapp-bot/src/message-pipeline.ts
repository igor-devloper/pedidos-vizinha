import { processInboundMessage } from "./automation.js";
import { emitWebhook } from "./webhook.js";
import { logger } from "./logger.js";
import type { InboundMessageJob } from "./types.js";

export async function handleInboundMessage(job: InboundMessageJob) {
  logger.info(
    {
      instanceId: job.instanceId,
      remoteJid: job.remoteJid,
      messageId: job.messageId,
      text: job.text,
    },
    "Inbound pipeline started"
  );

  try {
    await emitWebhook(job);
    logger.info(
      {
        instanceId: job.instanceId,
        remoteJid: job.remoteJid,
        messageId: job.messageId,
      },
      "Webhook pipeline completed"
    );
  } catch (error) {
    logger.error({ error, instanceId: job.instanceId }, "Webhook pipeline failed");
  }

  try {
    await processInboundMessage(job);
    logger.info(
      {
        instanceId: job.instanceId,
        remoteJid: job.remoteJid,
        messageId: job.messageId,
      },
      "Automation pipeline completed"
    );
  } catch (error) {
    logger.error({ error, instanceId: job.instanceId }, "Automation pipeline failed");
  }
}
