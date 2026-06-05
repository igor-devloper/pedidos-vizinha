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

type SendTextResult = {
  jid: string;
  verifiedJid: string | null;
  attemptedJids: string[];
  messageId: string;
};

class InstanceManager {
  private readonly sockets = new Map<string, RuntimeInstance>();
  private readonly openInstances = new Set<string>();

  async start(instanceId: string) {
    if (this.sockets.has(instanceId)) {
      return this.sockets.get(instanceId)!.socket;
    }

    const instance = await instanceStore.get(instanceId);
    if (!instance) {
      throw new Error("Instance not found");
    }

    this.openInstances.delete(instanceId);
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
        this.openInstances.delete(instanceId);
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
        this.openInstances.add(instanceId);
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
        this.openInstances.delete(instanceId);
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

    this.openInstances.delete(instanceId);
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
    const attemptedJids = this.buildCandidateJids(number);
    const { jid, verifiedJid } = await this.resolveDeliveryTarget(socket, attemptedJids);
    const result = await socket.sendMessage(jid, { text });
    const messageId = result?.key?.id;

    if (!messageId) {
      throw new Error("WhatsApp send did not return a message id.");
    }

    return {
      jid,
      verifiedJid,
      attemptedJids,
      messageId,
    } satisfies SendTextResult;
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

  private buildCandidateJids(number: string) {
    if (number.includes("@")) {
      return [number];
    }

    const digits = number.replace(/\D/g, "");
    const candidates = new Set<string>();

    const addCandidate = (value: string) => {
      if (!value) {
        return;
      }

      candidates.add(this.normalizeJid(value));
    };

    addCandidate(digits);

    if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
      addCandidate(`${digits.slice(0, 4)}${digits.slice(5)}`);
    }

    if (digits.length === 11 && digits[2] === "9") {
      addCandidate(`55${digits.slice(0, 2)}${digits.slice(3)}`);
    }

    if (digits.length === 10) {
      addCandidate(`55${digits}`);
    }

    return [...candidates];
  }

  private async resolveDeliveryTarget(socket: WASocket, candidateJids: string[]) {
    const verifiedJids = await this.findRegisteredJids(socket, candidateJids);

    if (verifiedJids.length > 0) {
      return {
        jid: verifiedJids[0],
        verifiedJid: verifiedJids[0],
      };
    }

    logger.warn(
      {
        candidateJids,
      },
      "Could not verify WhatsApp registration for destination; using first candidate"
    );

    return {
      jid: candidateJids[0],
      verifiedJid: null,
    };
  }

  private async findRegisteredJids(socket: WASocket, candidateJids: string[]) {
    const candidates = candidateJids.map((jid) => jid.replace(/@s\.whatsapp\.net$/, ""));
    const onWhatsApp = (socket as WASocket & {
      onWhatsApp?: (...numbers: string[]) => Promise<Array<{ jid?: string; exists?: boolean }>>;
    }).onWhatsApp;

    if (!onWhatsApp || candidates.length === 0) {
      return [];
    }

    try {
      const results = (await onWhatsApp(...candidates)) || [];
      const verified = results
        .filter((entry) => entry?.exists && entry.jid)
        .map((entry) => entry.jid as string);

      if (verified.length > 0) {
        logger.info(
          {
            candidateJids,
            verified,
          },
          "Verified WhatsApp recipient candidates"
        );
      }

      return verified;
    } catch (error) {
      logger.warn(
        {
          error,
          candidateJids,
        },
        "Failed to verify WhatsApp recipient candidates"
      );
      return [];
    }
  }

  private unwrapMessageContent(content: Record<string, unknown> | undefined): Record<string, unknown> | null {
    if (!content) {
      return null;
    }

    const nestedKeys = [
      "ephemeralMessage",
      "viewOnceMessage",
      "viewOnceMessageV2",
      "viewOnceMessageV2Extension",
      "documentWithCaptionMessage",
      "editedMessage",
    ] as const;

    for (const key of nestedKeys) {
      const nested = content[key] as { message?: Record<string, unknown> } | undefined;
      if (nested?.message) {
        const unwrapped = this.unwrapMessageContent(nested.message);
        if (unwrapped) {
          return unwrapped;
        }
      }
    }

    return content;
  }

  private extractText(message: unknown) {
    const wrapper = message as
      | {
          message?: Record<string, unknown>;
        }
      | undefined;

    const content = this.unwrapMessageContent(wrapper?.message);

    return (
      (content?.conversation as string | undefined) ||
      ((content?.extendedTextMessage as { text?: string } | undefined)?.text ?? "") ||
      ((content?.imageMessage as { caption?: string } | undefined)?.caption ?? "") ||
      ((content?.videoMessage as { caption?: string } | undefined)?.caption ?? "") ||
      ((content?.documentMessage as { caption?: string } | undefined)?.caption ?? "") ||
      ""
    );
  }

  private async extractMediaPayload(socket: WASocket, message: unknown): Promise<MediaPayload | null> {
    const content = message as
      | {
          message?: Record<string, unknown>;
        }
      | undefined;

    const payload = this.unwrapMessageContent(content?.message);
    const audio = payload?.audioMessage as { mimetype?: string } | undefined;
    const image = payload?.imageMessage as { mimetype?: string } | undefined;

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
    if (this.openInstances.has(instanceId)) {
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
