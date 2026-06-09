import { processInboundMessage } from "./automation.js";
import { markInboundMessageIfNew } from "./inbound-dedupe.js";
import { enrichInboundMedia } from "./media-understanding.js";
import { emitWebhook } from "./webhook.js";
import { logger } from "./logger.js";
import type { InboundMessageJob } from "./types.js";

export async function handleInboundMessage(job: InboundMessageJob) {
  if (!markInboundMessageIfNew(job)) {
    logger.info(
      {
        instanceId: job.instanceId,
        remoteJid: job.remoteJid,
        messageId: job.messageId,
        mediaKind: job.mediaKind,
      },
      "Skipping duplicated inbound WhatsApp message"
    );
    return;
  }

  const enrichedJob = await enrichInboundMedia(job);

  logger.info(
    {
      instanceId: enrichedJob.instanceId,
      remoteJid: enrichedJob.remoteJid,
      messageId: enrichedJob.messageId,
      text: enrichedJob.text,
    },
    "Inbound pipeline started"
  );

  try {
    await emitWebhook(enrichedJob);
    logger.info(
      {
        instanceId: enrichedJob.instanceId,
        remoteJid: enrichedJob.remoteJid,
        messageId: enrichedJob.messageId,
      },
      "Webhook pipeline completed"
    );
  } catch (error) {
    logger.error({ error, instanceId: enrichedJob.instanceId }, "Webhook pipeline failed");
  }

  try {
    await processInboundMessage(enrichedJob);
    logger.info(
      {
        instanceId: enrichedJob.instanceId,
        remoteJid: enrichedJob.remoteJid,
        messageId: enrichedJob.messageId,
      },
      "Automation pipeline completed"
    );
  } catch (error) {
    logger.error({ error, instanceId: enrichedJob.instanceId }, "Automation pipeline failed");
  }
}
