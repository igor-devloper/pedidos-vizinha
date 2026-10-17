import express from "express";
import { pinoHttp } from "pino-http";
import { z } from "zod";

import { requireApiKey } from "./auth.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { ensureDir, ensureParent } from "./fs-utils.js";
import { instanceManager } from "./instance-manager.js";
import { instanceStore } from "./instance-store.js";
import { logger } from "./logger.js";
import { createPrintJob, listPrintJobs } from "./print-job-store.js";
import { updateLeadByRemoteJid } from "./lead-repository.js";
import { qrStore } from "./qr-store.js";
import { findDraftsForPanel } from "./whatsapp-draft-repository.js";
import { startWhatsappFollowupWorker } from "./whatsapp-followup.js";
import { ensureWaSchema } from "./wa-schema.js";
import {
  getConversationLog,
  listConversations,
  pauseConversation,
  pruneOldRecords,
  resumeConversation,
} from "./conversation-repository.js";

const createInstanceSchema = z.object({
  name: z.string().min(2),
  phoneNumber: z.string().optional(),
  webhookUrl: z.string().url().optional(),
});

const conversationRefSchema = z.object({
  instanceId: z.string().min(1),
  jid: z.string().min(3),
});

const pauseSchema = conversationRefSchema.extend({
  hours: z.number().min(0.1).max(24 * 14).optional(),
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

const printJobSchema = z.object({
  orderId: z.string().min(1),
  code: z.string().min(1),
  reason: z.enum(["auto-accepted", "manual"]),
  printer: z.object({
    model: z.string().min(1),
    widthMm: z.number(),
    dpi: z.number(),
    commandSet: z.string().min(1),
  }),
  receipt: z.string().min(1),
  order: z
    .object({
      customerName: z.string().optional(),
      customerPhone: z.string().optional(),
      deliveryAt: z.string().optional(),
      productName: z.string().optional(),
      total: z.number().optional(),
    })
    .optional(),
});

async function bootstrap() {
  if (!config.geminiApiKey) {
    logger.warn(
      "Gemini is not configured; free-text and media understanding will use deterministic fallbacks",
    );
  }

  if (db) {
    await ensureWaSchema();
  } else {
    logger.warn(
      "DATABASE_URL not set: WhatsApp session will be stored on local disk and lost on redeploy"
    );
    await ensureDir(config.authDir);
    await ensureParent(config.instanceFile);
  }
  await ensureDir(config.storeDir);

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(pinoHttp({ logger }));

  app.get("/health", async (_req, res) => {
    const instances = await instanceStore.list();
    res.json({
      ok: true,
      service: "whatsapp-bot",
      totalInstances: instances.length,
      connectedInstances: instances.filter((item) => item.status === "connected").length,
      sessionStorage: db ? "postgres" : "disk",
      gemini: {
        configured: Boolean(config.geminiApiKey),
        model: config.geminiModel,
      },
    });
  });

  app.use(requireApiKey);

  app.get("/instances", async (_req, res) => {
    const instances = await instanceStore.list();
    res.json(instances);
  });

  app.get("/whatsapp-attendances", async (_req, res) => {
    res.json({ ok: true, drafts: await findDraftsForPanel() });
  });

  // Conversas do WhatsApp: lista, histórico (com chamadas de ferramenta) e pausa/retomada do bot.
  app.get("/conversations", async (_req, res) => {
    res.json({ ok: true, conversations: await listConversations() });
  });

  app.get("/conversations/log", async (req, res) => {
    const { instanceId, jid } = conversationRefSchema.parse({
      instanceId: req.query.instanceId,
      jid: req.query.jid,
    });
    res.json({ ok: true, messages: await getConversationLog(instanceId, jid) });
  });

  app.post("/conversations/pause", async (req, res) => {
    const { instanceId, jid, hours } = pauseSchema.parse(req.body);
    await pauseConversation(instanceId, jid, hours ?? config.handoffPauseHours, "Pausado pelo painel", "panel");
    res.json({ ok: true });
  });

  app.post("/conversations/resume", async (req, res) => {
    const { instanceId, jid } = conversationRefSchema.parse(req.body);
    await resumeConversation(instanceId, jid);
    res.json({ ok: true });
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

  // Único caminho que chama logout() no WhatsApp: desvincula o aparelho e apaga a sessão.
  app.post("/instances/:id/logout", async (req, res) => {
    const result = await instanceManager.logout(req.params.id);
    const instance = await instanceStore.get(req.params.id);
    res.json({ ...result, instance });
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
    await updateLeadByRemoteJid(req.params.id, `${payload.number.replace(/\D/g, "")}@s.whatsapp.net`, {
      lastOutboundText: payload.text,
    });

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

  app.post("/print-jobs", async (req, res) => {
    const payload = printJobSchema.parse(req.body);
    const job = await createPrintJob(payload);

    logger.info(
      {
        printJobId: job.id,
        orderId: job.orderId,
        code: job.code,
        reason: job.reason,
        printer: job.printer,
      },
      "Thermal print job queued"
    );

    res.status(201).json({ ok: true, job });
  });

  app.get("/print-jobs", async (req, res) => {
    const limitParam = Number(req.query.limit || 20);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 100)
      : 20;

    const jobs = await listPrintJobs(limit);
    res.json({ ok: true, jobs });
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

  void pruneOldRecords().catch((error) => logger.warn({ error }, "Failed to prune old WhatsApp records"));
  await instanceManager.bootConfiguredInstances();
  startWhatsappFollowupWorker();

  const server = app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        agentMode: config.agentMode,
        hasGeminiKey: Boolean(config.geminiApiKey),
        commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8),
        branch: process.env.RAILWAY_GIT_BRANCH,
        publicUrl:
          config.railwayPublicDomain || config.baseUrl,
      },
      "WhatsApp bot API listening"
    );
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "Shutting down: saving credentials and releasing WhatsApp locks");

    // Rede de segurança: nunca ficar preso no desligamento.
    setTimeout(() => process.exit(1), 12_000).unref();

    server.close();
    try {
      await instanceManager.shutdown();
    } catch (error) {
      logger.error({ error }, "Error during graceful shutdown");
    }
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

bootstrap().catch((error) => {
  logger.error({ error }, "Bot failed to start");
  process.exit(1);
});
