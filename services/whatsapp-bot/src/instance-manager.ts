import makeWASocket, {
  Browsers,
  type ConnectionState,
  DisconnectReason,
  downloadMediaMessage,
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

type MediaPayload = {
  kind: "audio" | "image";
  mimeType: string;
  base64: string;
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

        if (message.key.remoteJid.endsWith("@g.us")) {
          logger.info(
            {
              instanceId,
              remoteJid: message.key.remoteJid,
              messageId: message.key.id,
            },
            "Skipping message because it came from a group"
          );
          continue;
        }

        const text = this.extractText(message.message);
        const media = await this.extractMediaPayload(socket, message);

        if (!text && !media) {
          logger.info(
            {
              instanceId,
              remoteJid: message.key.remoteJid,
              messageId: message.key.id,
            },
            "Skipping message because no text or supported media payload was found"
          );
          continue;
        }

        logger.info(
          {
            instanceId,
            remoteJid: message.key.remoteJid,
            messageId: message.key.id,
            text,
            mediaKind: media?.kind,
          },
          "Inbound text extracted"
        );

        await handleInboundMessage({
          instanceId,
          remoteJid: message.key.remoteJid,
          pushName: message.pushName || undefined,
          text: text || `[${media?.kind || "mensagem"} recebida]`,
          originalText: text || undefined,
          mediaKind: media?.kind,
          mediaMimeType: media?.mimeType,
          mediaBase64: media?.base64,
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
    await this.waitForSocketReady(instanceId, socket);
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

  private extractText(message: unknown) {
    const wrapper = message as
      | {
          message?: {
            conversation?: string;
            extendedTextMessage?: { text?: string };
            imageMessage?: { caption?: string };
            videoMessage?: { caption?: string };
            documentWithCaptionMessage?: {
              message?: {
                documentMessage?: { caption?: string };
              };
            };
            documentMessage?: { caption?: string };
          };
        }
      | undefined;

    const content = wrapper?.message;

    return (
      content?.conversation ||
      content?.extendedTextMessage?.text ||
      content?.imageMessage?.caption ||
      content?.videoMessage?.caption ||
      content?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
      content?.documentMessage?.caption ||
      ""
    );
  }

  private async extractMediaPayload(socket: WASocket, message: unknown): Promise<MediaPayload | null> {
    const content = message as
      | {
          message?: {
            audioMessage?: { mimetype?: string };
            imageMessage?: { mimetype?: string };
          };
        }
      | undefined;

    const audio = content?.message?.audioMessage;
    const image = content?.message?.imageMessage;

    if (!audio && !image) {
      return null;
    }

    const kind = audio ? "audio" : "image";
    const mimeType = audio?.mimetype || image?.mimetype || (kind === "audio" ? "audio/ogg" : "image/jpeg");

    try {
      const data = await downloadMediaMessage(
        message as never,
        "buffer",
        {},
        {
          logger,
          reuploadRequest: socket.updateMediaMessage,
        }
      );

      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);

      if (!buffer.length) {
        return null;
      }

      return {
        kind,
        mimeType,
        base64: buffer.toString("base64"),
      };
    } catch (error) {
      logger.error(
        {
          error,
          instanceId: this.findInstanceIdBySocket(socket),
          mediaKind: kind,
          mimeType,
        },
        "Failed to download inbound media"
      );

      return null;
    }
  }

  private findInstanceIdBySocket(socket: WASocket) {
    for (const [instanceId, runtime] of this.sockets.entries()) {
      if (runtime.socket === socket) {
        return instanceId;
      }
    }

    return undefined;
  }

  private async waitForSocketReady(instanceId: string, socket: WASocket, timeoutMs = 15000) {
    if (socket.user?.id) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`WhatsApp instance ${instanceId} did not connect in time.`));
      }, timeoutMs);

      const onConnectionUpdate = (update: Partial<ConnectionState>) => {
        if (update.connection === "open") {
          cleanup();
          resolve();
          return;
        }

        if (update.connection === "close") {
          cleanup();
          reject(new Error(`WhatsApp instance ${instanceId} connection closed before sending.`));
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        socket.ev.off("connection.update", onConnectionUpdate);
      };

      socket.ev.on("connection.update", onConnectionUpdate);
    });
  }
}

export const instanceManager = new InstanceManager();
