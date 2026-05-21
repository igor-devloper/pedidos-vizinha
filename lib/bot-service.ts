type BotServiceRequestInit = RequestInit & {
  path: string;
};

function getBotServiceConfig() {
  const baseUrl = process.env.BOT_SERVICE_URL?.trim();
  const apiKey = process.env.BOT_SERVICE_API_KEY?.trim();

  return {
    baseUrl,
    apiKey,
    configured: Boolean(baseUrl && apiKey),
  };
}

export function getBotServiceMeta() {
  const config = getBotServiceConfig();

  return {
    configured: config.configured,
    baseUrl: config.baseUrl || null,
  };
}

export async function botServiceFetch<T>({
  path,
  headers,
  ...init
}: BotServiceRequestInit): Promise<T> {
  const config = getBotServiceConfig();

  if (!config.configured || !config.baseUrl || !config.apiKey) {
    throw new Error(
      "Serviço do bot não configurado. Defina BOT_SERVICE_URL e BOT_SERVICE_API_KEY."
    );
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? data.error
        : "Falha ao comunicar com o servico do bot.";
    throw new Error(message || "Falha ao comunicar com o servico do bot.");
  }

  return data as T;
}
