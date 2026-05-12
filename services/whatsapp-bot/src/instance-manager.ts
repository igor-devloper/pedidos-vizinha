import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";

import { config } from "./config.js";
import { getInstanceAuthPath } from "./auth-paths.js";
import { ensureDir, removeDir } from "./fs-utils.js";
import { instanceStore } from "./instance-store.js";
import { logger } from "./logger.js";
import { handleInboundMessage } from "./message-pipeline.js";
import { qrStore } from "./qr-store.js";

const loadMultiFileAuthState = useMultiFileAuthState;

type RuntimeInstance = {
  id: string;
  socket: WASocket;
};

class InstanceManager {
  private readonly sockets = new Map<string, RuntimeInstance>();

  async start(instanceId: string) {
    if (this.sockets.has(instanceId)) {
      return this.sockets.get(instanceId)!.socket;
    }

    const instance = await instanceStore.get(instanceId);
    if (!instance) {
      throw new Error("Instance not found");
    }

    await instanceStore.update(instanceId, { status: "connecting" });

    const authPath = getInstanceAuthPath(instanceId);
    await ensureDir(authPath);

    const { state, saveCreds } = await loadMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      auth: state,
      version,
      browser: Browsers.ubuntu("Sinapse Bot"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      logger,
      printQRInTerminal: false,
      getMessage: async () => undefined,
    });

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        qrStore.set({
          instanceId,
          qr,
          dataUrl,
          expiresAt: Date.now() + config.qrTtlSeconds * 1000,
        });

        await instanceStore.update(instanceId, { status: "qr" });
      }

      if (connection === "open") {
        const connectedJid = socket.user?.id || undefined;
        const connectedNumber = connectedJid
          ? connectedJid.split(":")[0]?.replace(/\D/g, "") || undefined
          : undefined;

        qrStore.remove(instanceId);
        await instanceStore.update(instanceId, {
          status: "connected",
          connectedJid,
          connectedNumber,
          lastConnectedAt: new Date().toISOString(),
          lastDisconnectReason: undefined,
        });
        logger.info(
          { instanceId, connectedJid, connectedNumber },
          "WhatsApp instance connected"
        );
      }

      if (connection === "close") {
        const disconnectCode = (lastDisconnect?.error as Boom | undefined)?.output
          ?.statusCode;

        const shouldReconnect =
          disconnectCode !== DisconnectReason.loggedOut &&
          disconnectCode !== DisconnectReason.badSession;

        await instanceStore.update(instanceId, {
          status: shouldReconnect ? "connecting" : "disconnected",
          lastDisconnectReason: String(disconnectCode || "unknown"),
        });

        this.sockets.delete(instanceId);

        if (shouldReconnect) {
          logger.warn({ instanceId, disconnectCode }, "Reconnecting instance");
          setTimeout(() => {
            void this.start(instanceId).catch((error) => {
              logger.error({ error, instanceId }, "Reconnect failed");
            });
          }, 2_000);
        }
      }
    });

    socket.ev.on("messages.upsert", async (event) => {
      logger.info(
        {
          instanceId,
          type: event.type,
          totalMessages: event.messages.length,
        },
        "messages.upsert received"
      );

      if (event.type !== "notify") {
        return;
      }

      for (const message of event.messages) {
        logger.info(
          {
            instanceId,
            remoteJid: message.key.remoteJid,
            fromMe: message.key.fromMe,
            messageId: message.key.id,
          },
          "Processing incoming WhatsApp message"
        );

        if (!message.key.remoteJid || message.key.fromMe) {
          logger.info(
            {
              instanceId,
              remoteJid: message.key.remoteJid,
              fromMe: message.key.fromMe,
            },
            "Skipping message because it is invalid or sent by the bot itself"
          );
          continue;
        }

        const text =
          message.message?.conversation ||
          message.message?.extendedTextMessage?.text ||
          "";

        if (!text) {
          logger.info(
            {
              instanceId,
              remoteJid: message.key.remoteJid,
              messageId: message.key.id,
            },
            "Skipping message because no text payload was found"
          );
          continue;
        }

        logger.info(
          {
            instanceId,
            remoteJid: message.key.remoteJid,
            messageId: message.key.id,
            text,
          },
          "Inbound text extracted"
        );

        await handleInboundMessage({
          instanceId,
          remoteJid: message.key.remoteJid,
          pushName: message.pushName || undefined,
          text,
          messageId: message.key.id || "",
          receivedAt: new Date().toISOString(),
        });
      }
    });

    this.sockets.set(instanceId, { id: instanceId, socket });
    return socket;
  }

  async stop(instanceId: string) {
    const runtime = this.sockets.get(instanceId);
    if (runtime) {
      const stoppable = runtime.socket as unknown as {
        end?: (error?: Error) => void;
      };
      stoppable.end?.(new Error("Instance stopped manually"));
      this.sockets.delete(instanceId);
    }

    await instanceStore.update(instanceId, { status: "idle" });
    qrStore.remove(instanceId);
  }

  async delete(instanceId: string) {
    await this.stop(instanceId);
    await removeDir(getInstanceAuthPath(instanceId));
    return instanceStore.remove(instanceId);
  }

  async sendText(instanceId: string, number: string, text: string) {
    const socket = await this.start(instanceId);
    const jid = this.normalizeJid(number);
    return socket.sendMessage(jid, { text });
  }

  getQr(instanceId: string) {
    return qrStore.get(instanceId);
  }

  async bootConfiguredInstances() {
    if (config.instanceBootIds.length === 0) {
      return;
    }

    for (const instanceId of config.instanceBootIds) {
      try {
        await this.start(instanceId);
      } catch (error) {
        logger.error({ error, instanceId }, "Failed to boot configured instance");
      }
    }
  }

  getConnectedInstance(instanceId: string) {
    return this.sockets.get(instanceId)?.socket || null;
  }

  private normalizeJid(number: string) {
    if (number.includes("@")) {
      return number;
    }

    const digits = number.replace(/\D/g, "");
    return `${digits}@s.whatsapp.net`;
  }
}

export const instanceManager = new InstanceManager();
