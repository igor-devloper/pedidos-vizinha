import { createBatcher } from "./agent/batcher.js";
import { mergeInboundJobs } from "./agent/merge-jobs.js";
import { processInboundMessage } from "./automation.js";
import { config } from "./config.js";
import { logMessage, markMessageSeen } from "./conversation-repository.js";
import { markInboundMessageIfNew } from "./inbound-dedupe.js";
import { enrichInboundMedia } from "./media-understanding.js";
import { emitWebhook } from "./webhook.js";
import { logger } from "./logger.js";
import type { InboundMessageJob } from "./types.js";

async function runAutomation(job: InboundMessageJob) {
  try {
    await processInboundMessage(job);
    logger.info(
      { instanceId: job.instanceId, remoteJid: job.remoteJid, messageId: job.messageId },
      "Automation pipeline completed"
    );
  } catch (error) {
    logger.error({ error, instanceId: job.instanceId }, "Automation pipeline failed");
  }
}

// Cliente que manda várias mensagens seguidas recebe UMA resposta, depois de alguns segundos de silêncio.
const batcher = createBatcher<InboundMessageJob>({
  quietMs: config.batchQuietMs,
  maxWaitMs: config.batchMaxWaitMs,
  onFlush: async (_key, jobs) => {
    if (jobs.length > 1) {
      logger.info({ remoteJid: jobs[0].remoteJid, messages: jobs.length }, "Answering a burst of messages at once");
    }
    await runAutomation(mergeInboundJobs(jobs));
  },
  onError: (key, error) => logger.error({ error, key }, "Batched conversation turn failed"),
});

function isOwnerChat(remoteJid: string) {
  const owner = config.ownerApprovalNumber.replace(/\D/g, "");
  return Boolean(owner) && remoteJid.replace(/\D/g, "") === owner;
}

export async function flushPendingMessages() {
  await batcher.flushAll();
}

export async function handleInboundMessage(job: InboundMessageJob) {
  if (!markInboundMessageIfNew(job) || !(await markMessageSeen(job.instanceId, job.messageId))) {
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

  await logMessage(enrichedJob.instanceId, enrichedJob.remoteJid, "in", enrichedJob.text, {
    messageId: enrichedJob.messageId,
    mediaKind: enrichedJob.mediaKind,
  });

  try {
    await emitWebhook(enrichedJob);
  } catch (error) {
    logger.error({ error, instanceId: enrichedJob.instanceId }, "Webhook pipeline failed");
  }

  // Comandos da Vizinha respondem na hora; clientes entram na fila de rajada.
  if (isOwnerChat(enrichedJob.remoteJid)) {
    await runAutomation(enrichedJob);
    return;
  }

  batcher.push(`${enrichedJob.instanceId}:${enrichedJob.remoteJid}`, enrichedJob);
}
