const DEDUPE_TTL_MS = 10 * 60 * 1000;

const seenMessages = new Map<string, number>();

function pruneExpired(now: number) {
  for (const [key, expiresAt] of seenMessages.entries()) {
    if (expiresAt <= now) {
      seenMessages.delete(key);
    }
  }
}

export function markInboundMessageIfNew(instanceId: string, messageId: string) {
  if (!messageId) {
    return true;
  }

  const now = Date.now();
  pruneExpired(now);
  const key = `${instanceId}:${messageId}`;

  if (seenMessages.has(key)) {
    return false;
  }

  seenMessages.set(key, now + DEDUPE_TTL_MS);
  return true;
}
