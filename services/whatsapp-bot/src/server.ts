import express from "express";
import { pinoHttp } from "pino-http";
import { z } from "zod";

import { requireApiKey } from "./auth.js";
import { config } from "./config.js";
import { ensureDir, ensureParent } from "./fs-utils.js";
import { instanceManager } from "./instance-manager.js";
import { instanceStore } from "./instance-store.js";
import { logger } from "./logger.js";
import { qrStore } from "./qr-store.js";

const createInstanceSchema = z.object({
  name: z.string().min(2),
  phoneNumber: z.string().optional(),
  webhookUrl: z.string().url().optional(),
});

const sendTextSchema = z.object({
  number: z.string().min(8),
  text: z.string().min(1),
});

const sendImageSchema = z.object({
  number: z.string().min(8),
  imageUrl: z.string().url(),
  caption: z.string().optional(),
});

async function bootstrap() {
  await ensureDir(config.authDir);
  await ensureDir(config.storeDir);
  await ensureParent(config.instanceFile);

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(pinoHttp({ logger }));

  app.get("/health", async (_req, res) => {
    const instances = await instanceStore.list();
    res.json({
      ok: true,
      service: "whatsapp-bot",
      totalInstances: instances.length,
    });
  });

  app.use(requireApiKey);

  app.get("/instances", async (_req, res) => {
    const instances = await instanceStore.list();
    res.json(instances);
  });

  app.post("/instances", async (req, res) => {
    const payload = createInstanceSchema.parse(req.body);
    const instance = await instanceStore.create(payload);
    res.status(201).json(instance);
  });

  app.post("/instances/:id/start", async (req, res) => {
    await instanceManager.start(req.params.id);
    const instance = await instanceStore.get(req.params.id);
    res.json(instance);
  });

  app.post("/instances/:id/stop", async (req, res) => {
    await instanceManager.stop(req.params.id);
    const instance = await instanceStore.get(req.params.id);
    res.json(instance);
  });

  app.delete("/instances/:id", async (req, res) => {
    const removed = await instanceManager.delete(req.params.id);
    res.json({ removed });
  });

  app.get("/instances/:id/qr", async (req, res) => {
    const snapshot = qrStore.get(req.params.id);

    if (!snapshot) {
      return res.status(404).json({ error: "QR not available" });
    }

    res.json(snapshot);
  });

  app.post("/instances/:id/send-text", async (req, res) => {
    const payload = sendTextSchema.parse(req.body);
    const result = await instanceManager.sendText(
      req.params.id,
      payload.number,
      payload.text
    );

    res.json({ ok: true, result });
  });

  app.post("/instances/:id/send-image", async (req, res) => {
    const payload = sendImageSchema.parse(req.body);
    const result = await instanceManager.sendImage(req.params.id, payload.number, {
      imageUrl: payload.imageUrl,
      caption: payload.caption,
    });

    res.json({ ok: true, result });
  });

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _nextUnused: express.NextFunction
    ) => {
      void _nextUnused;
      logger.error({ error }, "Request failed");

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Invalid payload",
          details: error.flatten(),
        });
      }

      const message = error instanceof Error ? error.message : "Unexpected error";
      res.status(500).json({ error: message });
    }
  );

  await instanceManager.bootConfiguredInstances();

  app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        publicUrl:
          config.railwayPublicDomain || config.baseUrl,
      },
      "WhatsApp bot API listening"
    );
  });
}

void bootstrap();
