import { normalizePhone } from "@/lib/pedidos";
import { formatWhatsAppText } from "@/lib/whatsapp-message";

function getBotServiceUrl() {
  return (
    process.env.BAILEYS_SERVICE_URL?.trim() ||
    process.env.BOT_SERVICE_URL?.trim() ||
    ""
  );
}

function getBotApiKey() {
  return (
    process.env.BOT_API_KEY?.trim() ||
    process.env.BOT_SERVICE_API_KEY?.trim() ||
    ""
  );
}

function getBotInstanceId() {
  return process.env.BOT_INSTANCE_ID?.trim() || process.env.WHATSAPP_INSTANCE_ID?.trim() || "";
}

type BotInstanceRecord = {
  id: string;
  status?: string;
  name?: string;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveBotInstanceId(baseUrl: string, apiKey: string, preferredInstanceId: string) {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/instances`, {
      headers: {
        Authorization: `Bearer ${apiKey.replace(/^Bearer\s+/i, "")}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return preferredInstanceId;
    }

    const instances = (await response.json().catch(() => [])) as BotInstanceRecord[];
    const preferred = preferredInstanceId
      ? instances.find((instance) => instance.id === preferredInstanceId)
      : null;

    if (preferred?.status === "connected") {
      return preferred.id;
    }

    const connected = instances.find((instance) => instance.status === "connected");

    if (connected) {
      if (preferredInstanceId && connected.id !== preferredInstanceId) {
        console.warn("WhatsApp notification using fallback connected instance.", {
          preferredInstanceId,
          fallbackInstanceId: connected.id,
          fallbackName: connected.name,
        });
      }

      return connected.id;
    }
  } catch (error) {
    console.warn("WhatsApp notification could not resolve connected instance.", {
      preferredInstanceId,
      error,
    });
  }

  return preferredInstanceId;
}

export async function sendWhatsappText(number: string, text: string) {
  const baseUrl = getBotServiceUrl();
  const apiKey = getBotApiKey();
  const preferredInstanceId = getBotInstanceId();

  if (!baseUrl || !apiKey || !preferredInstanceId) {
    console.warn("WhatsApp notification skipped: bot service not configured.");
    return { ok: false, skipped: true };
  }

  const normalized = normalizePhone(number);
  const formattedText = formatWhatsAppText(text);
  if (!normalized) {
    console.warn("WhatsApp notification skipped: invalid phone.");
    return { ok: false, skipped: true };
  }

  let lastError = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const instanceId = await resolveBotInstanceId(baseUrl, apiKey, preferredInstanceId);
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/instances/${instanceId}/send-text`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.replace(/^Bearer\s+/i, "")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        number: normalized,
        text: formattedText,
      }),
    });

    if (response.ok) {
      return response.json().catch(() => ({ ok: true }));
    }

    const data = await response.text().catch(() => "");
    lastError = `Falha ao enviar WhatsApp: ${response.status} ${data}`;

    if (!/Connection Closed/i.test(data) || attempt === 2) {
      throw new Error(lastError);
    }

    console.warn("WhatsApp send retry after closed connection.", {
      attempt: attempt + 1,
      instanceId,
      number: normalized,
    });

    await delay(2000);
  }

  throw new Error(lastError || "Falha ao enviar WhatsApp.");
}
