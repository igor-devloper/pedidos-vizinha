export type InstanceStatus =
  | "idle"
  | "connecting"
  | "qr"
  | "connected"
  | "disconnected"
  | "error";

export type InstanceRecord = {
  id: string;
  name: string;
  phoneNumber?: string;
  connectedJid?: string;
  connectedNumber?: string;
  status: InstanceStatus;
  webhookUrl?: string;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
  lastDisconnectReason?: string;
};

export type QrSnapshot = {
  instanceId: string;
  qr: string;
  dataUrl: string;
  expiresAt: number;
};

export type SendTextPayload = {
  number: string;
  text: string;
};

export type InboundMessageJob = {
  instanceId: string;
  remoteJid: string;
  pushName?: string;
  text: string;
  messageId: string;
  receivedAt: string;
};

export type ScheduledMessageJob = {
  instanceId: string;
  number: string;
  text: string;
  runAt: string;
};
