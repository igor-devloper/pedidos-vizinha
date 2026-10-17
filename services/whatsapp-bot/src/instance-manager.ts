import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import makeWASocket, {
  Browsers,
  type ConnectionState,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";

import { type OpenedAuthState, openAuthState } from "./auth-state.js";
import { config } from "./config.js";
import { conversationKey, logMessage, pauseConversation } from "./conversation-repository.js";
import { db } from "./db.js";
import { InstanceLock, createLocalLockStore, createPgLockStore } from "./instance-lock.js";
import { instanceStore } from "./instance-store.js";
import { updateLeadByRemoteJid } from "./lead-repository.js";
import { logger } from "./logger.js";
import { handleInboundMessage } from "./message-pipeline.js";
import { qrStore } from "./qr-store.js";
import { decideReconnect, shouldAutoStart } from "./reconnect-policy.js";
import type { InstanceRecord } from "./types.js";
import { formatWhatsAppText } from "./whatsapp-format.js";

const LOCK_TTL_MS = 30_000;
const LOCK_RENEW_MS = 10_000;
const STANDBY_RETRY_MS = 5_000;
const SHUTDOWN_STEP_TIMEOUT_MS = 5_000;

const processOwnerId = `${process.env.RAILWAY_DEPLOYMENT_ID || hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

type Runtime = {
  id: string;
  socket: WASocket | null;
  auth: OpenedAuthState | null;
  lock: InstanceLock;
  /** Parada intencional (stop/logout/shutdown): eventos de fechamento não reconectam. */
  stopping: boolean;
  failures: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
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

type SendImageInput = {
  caption?: string;
  imageUrl?: string;
};

function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

class InstanceManager {
  private readonly runtimes = new Map<string, Runtime>();
  private readonly openInstances = new Set<string>();
  private readonly lockStore = db ? createPgLockStore() : createLocalLockStore();
  private shuttingDown = false;
  /** Mensagens enviadas pelo próprio bot: o eco "fromMe" delas não é a Vizinha respondendo. */
  private readonly botSentIds = new Map<string, number>();

  /**
   * Liga a instância. Devolve o socket, ou null se outro processo segura a trava
   * (nesse caso a instância fica em "standby" e tenta assumir sozinha).
   */
  async start(instanceId: string): Promise<WASocket | null> {
    const existing = this.runtimes.get(instanceId);
    if (existing?.socket) {
      return existing.socket;
    }

    const instance = await instanceStore.get(instanceId);
    if (!instance) {
      throw new Error("Instance not found");
    }

    const runtime = existing ?? this.createRuntime(instanceId);
    runtime.stopping = false;
    await instanceStore.update(instanceId, { autoStart: true });
    return this.attempt(runtime);
  }

  private createRuntime(instanceId: string) {
    const runtime: Runtime = {
      id: instanceId,
      socket: null,
      auth: null,
      stopping: false,
      failures: 0,
      retryTimer: null,
      lock: new InstanceLock(
        this.lockStore,
        instanceId,
        processOwnerId,
        { ttlMs: LOCK_TTL_MS, renewEveryMs: LOCK_RENEW_MS },
        (reason) => void this.onLockLost(instanceId, reason)
      ),
    };
    this.runtimes.set(instanceId, runtime);
    return runtime;
  }

  private scheduleAttempt(runtime: Runtime, delayMs: number) {
    if (runtime.stopping || this.shuttingDown) {
      return;
    }

    if (runtime.retryTimer) {
      clearTimeout(runtime.retryTimer);
    }

    runtime.retryTimer = setTimeout(() => {
      runtime.retryTimer = null;
      void this.attempt(runtime).catch((error) => {
        logger.error({ error, instanceId: runtime.id }, "Reconnect attempt failed");
        this.scheduleAttempt(runtime, STANDBY_RETRY_MS);
      });
    }, delayMs);
  }

  private async attempt(runtime: Runtime): Promise<WASocket | null> {
    const instanceId = runtime.id;
    if (runtime.stopping || this.shuttingDown || runtime.socket) {
      return runtime.socket;
    }

    let acquired = false;
    try {
      acquired = await runtime.lock.tryAcquire();
    } catch (error) {
      logger.error({ error, instanceId }, "Could not reach the lock store");
    }

    if (!acquired) {
      logger.info({ instanceId, owner: processOwnerId }, "Another process holds the WhatsApp lock; standing by");
      await instanceStore.update(instanceId, { status: "standby" }).catch(() => undefined);
      this.scheduleAttempt(runtime, STANDBY_RETRY_MS);
      return null;
    }

    try {
      return await this.connect(runtime);
    } catch (error) {
      logger.error({ error, instanceId }, "Failed to open WhatsApp socket");
      runtime.failures += 1;
      await instanceStore.update(instanceId, { status: "reconnecting" }).catch(() => undefined);
      this.scheduleAttempt(runtime, STANDBY_RETRY_MS * runtime.failures);
      return null;
    }
  }

  private async connect(runtime: Runtime): Promise<WASocket> {
    const instanceId = runtime.id;
    await instanceStore.update(instanceId, {
      status: runtime.failures > 0 ? "reconnecting" : "connecting",
    });

    await runtime.auth?.flush().catch(() => undefined);
    const auth = await openAuthState(instanceId);
    runtime.auth = auth;
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      auth: {
        creds: auth.state.creds,
        keys: makeCacheableSignalKeyStore(auth.state.keys, logger),
      },
      version,
      browser: Browsers.ubuntu("Sinapse Bot"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      logger,
      printQRInTerminal: false,
      getMessage: async () => undefined,
    });
    runtime.socket = socket;

    socket.ev.on("creds.update", () => {
      void auth.saveCreds().catch((error) => {
        logger.error({ error, instanceId }, "Failed to persist WhatsApp credentials");
      });
    });

    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      // Evento de um socket que já foi trocado ou encerrado: ignorar.
      if (runtime.socket !== socket) {
        return;
      }

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
        runtime.failures = 0;
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
        runtime.socket = null;
        const disconnectCode = (lastDisconnect?.error as Boom | undefined)?.output
          ?.statusCode;
        const decision = decideReconnect(disconnectCode, runtime.failures);
        const reason = String(disconnectCode || "unknown");

        if (runtime.stopping || this.shuttingDown) {
          return;
        }

        if (decision.action === "logged-out") {
          // Único caso em que a sessão é apagada: o WhatsApp a invalidou (ou o aparelho foi desvinculado).
          logger.warn({ instanceId }, "WhatsApp session logged out; clearing credentials and requesting a new QR");
          await instanceStore.update(instanceId, { status: "disconnected", lastDisconnectReason: reason });
          await auth.clear();
          runtime.failures = 0;
          this.scheduleAttempt(runtime, 1_000);
          return;
        }

        if (decision.action === "yield") {
          logger.warn({ instanceId }, "Session taken over by another connection; releasing lock");
          await instanceStore.update(instanceId, { status: "standby", lastDisconnectReason: reason });
          await auth.flush().catch(() => undefined);
          await runtime.lock.release();
          this.scheduleAttempt(runtime, decision.delayMs);
          return;
        }

        if (decision.failure) {
          runtime.failures += 1;
        }

        await instanceStore.update(instanceId, { status: "reconnecting", lastDisconnectReason: reason });
        logger.warn(
          { instanceId, disconnectCode, delayMs: decision.delayMs, failures: runtime.failures },
          "Reconnecting instance"
        );
        this.scheduleAttempt(runtime, decision.delayMs);
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

      if (event.type !== "notify" && event.type !== "append") {
        return;
      }

      for (const message of event.messages) {
        // Mensagem enviada por nós (celular da Vizinha ou o próprio bot): pode ser uma assunção humana.
        if (message.key.fromMe) {
          if (message.key.remoteJid && this.isDirectChat(message.key.remoteJid)) {
            void this.handleOutgoingMessage(instanceId, message);
          }
          continue;
        }

        // "append" são mensagens antigas sincronizadas; só "notify" é conversa nova.
        if (event.type !== "notify") {
          continue;
        }

        const ageSeconds = Date.now() / 1000 - Number(message.messageTimestamp || 0);
        if (message.messageTimestamp && ageSeconds > config.maxInboundAgeSeconds) {
          logger.info(
            { instanceId, remoteJid: message.key.remoteJid, messageId: message.key.id, ageSeconds: Math.round(ageSeconds) },
            "Skipping old message received after reconnecting"
          );
          continue;
        }

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
          const payload = this.unwrapMessageContent(
            (message as { message?: Record<string, unknown> } | undefined)?.message
          );
          logger.info(
            {
              instanceId,
              remoteJid: message.key.remoteJid,
              messageId: message.key.id,
              messageKeys: payload ? Object.keys(payload) : [],
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
          phoneNumber: message.key.remoteJidAlt?.replace(/\D/g, "") || undefined,
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

    return socket;
  }

  /** O heartbeat não conseguiu renovar a trava: fecha o socket já, para nunca haver dois. */
  private async onLockLost(instanceId: string, reason: string) {
    const runtime = this.runtimes.get(instanceId);
    if (!runtime || runtime.stopping) {
      return;
    }

    logger.error({ instanceId, reason }, "WhatsApp lock lost; closing socket to avoid duplicate connections");
    this.closeSocket(runtime);
    await instanceStore.update(instanceId, { status: "standby" }).catch(() => undefined);
    this.scheduleAttempt(runtime, STANDBY_RETRY_MS);
  }

  /** Fecha o socket sem deslogar (end, nunca logout) e sem disparar reconexão. */
  private closeSocket(runtime: Runtime) {
    const socket = runtime.socket;
    runtime.socket = null;
    this.openInstances.delete(runtime.id);
    try {
      socket?.end(undefined);
    } catch (error) {
      logger.warn({ error, instanceId: runtime.id }, "Error while closing socket");
    }
  }

  private async halt(runtime: Runtime) {
    runtime.stopping = true;
    if (runtime.retryTimer) {
      clearTimeout(runtime.retryTimer);
      runtime.retryTimer = null;
    }

    this.closeSocket(runtime);
    await withTimeout(runtime.auth?.flush().catch(() => undefined) ?? Promise.resolve(), SHUTDOWN_STEP_TIMEOUT_MS);
    await withTimeout(runtime.lock.release(), SHUTDOWN_STEP_TIMEOUT_MS);
    this.runtimes.delete(runtime.id);
  }

  /** Parada manual pelo painel: não sobe sozinha no próximo deploy. */
  async stop(instanceId: string) {
    const runtime = this.runtimes.get(instanceId);
    if (runtime) {
      await this.halt(runtime);
    }

    await instanceStore.update(instanceId, { status: "idle", autoStart: false });
    qrStore.remove(instanceId);
  }

  /**
   * Desconectar o WhatsApp de verdade: é o ÚNICO lugar que chama logout().
   * O aparelho é desvinculado e a sessão apagada; será preciso ler um QR novo.
   */
  async logout(instanceId: string) {
    const instance = await instanceStore.get(instanceId);
    if (!instance) {
      throw new Error("Instance not found");
    }

    const runtime = this.runtimes.get(instanceId);
    let remoteLogout = false;

    if (runtime?.socket && this.openInstances.has(instanceId)) {
      runtime.stopping = true;
      try {
        await withTimeout(runtime.socket.logout(), SHUTDOWN_STEP_TIMEOUT_MS * 2);
        remoteLogout = true;
      } catch (error) {
        logger.warn({ error, instanceId }, "Remote logout failed; clearing local session anyway");
      }
    }

    const auth = runtime?.auth ?? (await openAuthState(instanceId));
    if (runtime) {
      await this.halt(runtime);
    }
    await auth.clear();
    await instanceStore.update(instanceId, {
      status: "idle",
      autoStart: false,
      connectedJid: undefined,
      connectedNumber: undefined,
      lastDisconnectReason: "logout",
    });
    qrStore.remove(instanceId);
    return { remoteLogout };
  }

  async delete(instanceId: string) {
    await this.stop(instanceId);
    const auth = await openAuthState(instanceId);
    await auth.clear();
    return instanceStore.remove(instanceId);
  }

  /** Desligamento gracioso (SIGTERM/SIGINT): grava credenciais, solta a trava, nunca desloga. */
  async shutdown() {
    this.shuttingDown = true;
    await Promise.all([...this.runtimes.values()].map((runtime) => this.halt(runtime)));
  }

  getRuntimeSummary() {
    return [...this.runtimes.values()].map((runtime) => ({
      id: runtime.id,
      hasSocket: Boolean(runtime.socket),
      open: this.openInstances.has(runtime.id),
      lockHeld: runtime.lock.isHeld,
      failures: runtime.failures,
    }));
  }

  private requireSocket(instanceId: string) {
    const socket = this.runtimes.get(instanceId)?.socket;
    if (!socket) {
      throw new Error(
        `WhatsApp instance ${instanceId} is not connected on this server (stopped or standing by).`
      );
    }
    return socket;
  }

  async sendText(instanceId: string, number: string, text: string) {
    const socket = this.requireSocket(instanceId);
    await this.waitForSocketReady(instanceId, socket);
    const attemptedJids = this.buildCandidateJids(number);
    const { jid, verifiedJid } = await this.resolveDeliveryTarget(socket, attemptedJids);
    const result = await socket.sendMessage(jid, { text: formatWhatsAppText(text) });
    const messageId = result?.key?.id;

    if (!messageId) {
      throw new Error("WhatsApp send did not return a message id.");
    }

    this.rememberBotMessage(messageId);
    await updateLeadByRemoteJid(instanceId, jid, {
      lastOutboundText: formatWhatsAppText(text),
    });
    // Histórico da conversa (alimenta o agente e o painel). Mensagens para a Vizinha não entram.
    if (conversationKey(number).replace(/\D/g, "") !== config.ownerApprovalNumber.replace(/\D/g, "")) {
      await logMessage(instanceId, conversationKey(number), "out", formatWhatsAppText(text));
    }

    return {
      jid,
      verifiedJid,
      attemptedJids,
      messageId,
    } satisfies SendTextResult;
  }

  async sendImage(instanceId: string, number: string, input: SendImageInput) {
    const socket = this.requireSocket(instanceId);
    await this.waitForSocketReady(instanceId, socket);
    const attemptedJids = this.buildCandidateJids(number);
    const { jid, verifiedJid } = await this.resolveDeliveryTarget(socket, attemptedJids);

    if (!input.imageUrl) {
      throw new Error("WhatsApp image send requires imageUrl.");
    }

    const result = await socket.sendMessage(jid, {
      image: { url: input.imageUrl },
      caption: input.caption ? formatWhatsAppText(input.caption) : undefined,
    });
    const messageId = result?.key?.id;

    if (!messageId) {
      throw new Error("WhatsApp image send did not return a message id.");
    }

    this.rememberBotMessage(messageId);

    return {
      jid,
      verifiedJid,
      attemptedJids,
      messageId,
    } satisfies SendTextResult;
  }

  private rememberBotMessage(messageId: string) {
    const now = Date.now();
    this.botSentIds.set(messageId, now + 10 * 60_000);
    for (const [id, expiresAt] of this.botSentIds) {
      if (expiresAt < now) this.botSentIds.delete(id);
    }
  }

  private isDirectChat(remoteJid: string) {
    return remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid");
  }

  /**
   * Mensagem "fromMe" que o bot não enviou = a Vizinha respondeu pelo celular.
   * O bot se cala naquela conversa pelo tempo configurado e guarda a fala dela no histórico.
   */
  private async handleOutgoingMessage(instanceId: string, message: { key: { id?: string | null; remoteJid?: string | null }; message?: unknown; messageTimestamp?: unknown }) {
    // O eco da nossa própria mensagem pode chegar antes de o envio terminar: espera um instante.
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    const messageId = message.key.id || "";
    const remoteJid = message.key.remoteJid;
    if (!remoteJid || (messageId && this.botSentIds.has(messageId))) {
      return;
    }

    const ageSeconds = Date.now() / 1000 - Number(message.messageTimestamp || 0);
    if (message.messageTimestamp && ageSeconds > config.maxInboundAgeSeconds) {
      return;
    }

    if (remoteJid.replace(/\D/g, "") === config.ownerApprovalNumber.replace(/\D/g, "")) {
      return;
    }

    try {
      const text = this.extractText(message.message) || "[mensagem sem texto]";
      await logMessage(instanceId, remoteJid, "out", `[Vizinha] ${text}`, { messageId, by: "owner" });
      await pauseConversation(
        instanceId,
        remoteJid,
        config.handoffPauseHours,
        "A Vizinha respondeu pelo celular",
        "owner"
      );
      logger.info({ instanceId, remoteJid, hours: config.handoffPauseHours }, "Owner replied manually; bot paused for this conversation");
    } catch (error) {
      logger.error({ error, instanceId, remoteJid }, "Failed to pause conversation after owner reply");
    }
  }

  getQr(instanceId: string) {
    return qrStore.get(instanceId);
  }

  async bootConfiguredInstances() {
    const records: InstanceRecord[] = await instanceStore.list();
    const ids = new Set(config.instanceBootIds);
    for (const record of records) {
      if (shouldAutoStart(record)) {
        ids.add(record.id);
      }
    }

    for (const instanceId of ids) {
      try {
        await this.start(instanceId);
      } catch (error) {
        logger.error({ error, instanceId }, "Failed to boot configured instance");
      }
    }
  }

  getConnectedInstance(instanceId: string) {
    return this.runtimes.get(instanceId)?.socket || null;
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
    const rawContent = message as Record<string, unknown> | undefined;
    const wrapper = message as
      | {
          message?: Record<string, unknown>;
        }
      | undefined;

    const content = this.unwrapMessageContent(rawContent?.message ? wrapper?.message : rawContent);

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
    for (const [instanceId, runtime] of this.runtimes.entries()) {
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
