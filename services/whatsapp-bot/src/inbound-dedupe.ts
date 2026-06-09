import { createHash } from "node:crypto";

import type { InboundMessageJob } from "./types.js";

const DEDUPE_TTL_MS = 10 * 60 * 1000;
const MEDIA_CONTENT_DEDUPE_TTL_MS = 30 * 1000;

const seenMessages = new Map<string, number>();

function pruneExpired(now: number) {
  for (const [key, expiresAt] of seenMessages.entries()) {
    if (expiresAt <= now) {
      seenMessages.delete(key);
    }
  }
}

function buildMediaContentKey(job: InboundMessageJob) {
  if (!job.mediaKind || !job.mediaBase64) {
    return null;
  }

  const hash = createHash("sha1").update(job.mediaBase64).digest("hex");
  return `${job.instanceId}:${job.remoteJid}:${job.mediaKind}:${job.mediaMimeType || ""}:${hash}`;
}

export function markInboundMessageIfNew(job: InboundMessageJob) {
  const now = Date.now();
  pruneExpired(now);
  const messageId = job.messageId?.trim();

  if (messageId) {
    const key = `${job.instanceId}:${messageId}`;

    if (seenMessages.has(key)) {
      return false;
    }

    seenMessages.set(key, now + DEDUPE_TTL_MS);
  }

  const mediaContentKey = buildMediaContentKey(job);
  if (mediaContentKey) {
    if (seenMessages.has(mediaContentKey)) {
      return false;
    }

    seenMessages.set(mediaContentKey, now + MEDIA_CONTENT_DEDUPE_TTL_MS);
  }

  return true;
}
