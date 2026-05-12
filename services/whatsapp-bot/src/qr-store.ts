import type { QrSnapshot } from "./types.js";

class QrStore {
  private readonly items = new Map<string, QrSnapshot>();

  get(instanceId: string) {
    const item = this.items.get(instanceId);

    if (!item) {
      return null;
    }

    if (item.expiresAt <= Date.now()) {
      this.items.delete(instanceId);
      return null;
    }

    return item;
  }

  set(item: QrSnapshot) {
    this.items.set(item.instanceId, item);
  }

  remove(instanceId: string) {
    this.items.delete(instanceId);
  }
}

export const qrStore = new QrStore();
