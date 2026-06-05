import { normalizePhone } from "@/lib/pedidos";

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

export async function sendWhatsappText(number: string, text: string) {
  const baseUrl = getBotServiceUrl();
  const apiKey = getBotApiKey();
  const instanceId = getBotInstanceId();

  if (!baseUrl || !apiKey || !instanceId) {
    console.warn("WhatsApp notification skipped: bot service not configured.");
    return { ok: false, skipped: true };
  }

  const normalized = normalizePhone(number);
  if (!normalized) {
    console.warn("WhatsApp notification skipped: invalid phone.");
    return { ok: false, skipped: true };
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/instances/${instanceId}/send-text`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.replace(/^Bearer\s+/i, "")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      number: normalized,
      text,
    }),
  });

  if (!response.ok) {
    const data = await response.text().catch(() => "");
    throw new Error(`Falha ao enviar WhatsApp: ${response.status} ${data}`);
  }

  return response.json().catch(() => ({ ok: true }));
}
