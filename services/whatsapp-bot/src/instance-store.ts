import { randomUUID } from "node:crypto";

import { config } from "./config.js";
import { readJson, writeJson } from "./fs-utils.js";
import type { InstanceRecord } from "./types.js";

type InstanceCreateInput = {
  name: string;
  phoneNumber?: string;
  webhookUrl?: string;
};

class InstanceStore {
  async list() {
    return readJson<InstanceRecord[]>(config.instanceFile, []);
  }

  async get(instanceId: string) {
    const items = await this.list();
    return items.find((item) => item.id === instanceId) || null;
  }

  async create(input: InstanceCreateInput) {
    const items = await this.list();
    const now = new Date().toISOString();

    const record: InstanceRecord = {
      id: randomUUID(),
      name: input.name,
      phoneNumber: input.phoneNumber,
      webhookUrl: input.webhookUrl,
      status: "idle",
      createdAt: now,
      updatedAt: now,
    };

    items.push(record);
    await writeJson(config.instanceFile, items);
    return record;
  }

  async update(instanceId: string, patch: Partial<InstanceRecord>) {
    const items = await this.list();
    const index = items.findIndex((item) => item.id === instanceId);

    if (index === -1) {
      return null;
    }

    const current = items[index];
    const next: InstanceRecord = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    items[index] = next;
    await writeJson(config.instanceFile, items);
    return next;
  }

  async remove(instanceId: string) {
    const items = await this.list();
    const next = items.filter((item) => item.id !== instanceId);
    const changed = next.length !== items.length;

    if (changed) {
      await writeJson(config.instanceFile, next);
    }

    return changed;
  }
}

export const instanceStore = new InstanceStore();
