import { db } from "./db.js";
import { logger } from "./logger.js";

type BotFlow = {
  id: string;
  nome: string;
  descricao: string | null;
  instanceId: string | null;
  gatilho: string;
  resposta: string;
  ativo: boolean;
  prioridade: number;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function splitTriggers(value: string) {
  return value
    .split(/[\n,;|]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function triggerMatches(triggerSource: string, message: string) {
  const triggers = splitTriggers(triggerSource);
  const normalizedMessage = normalizeText(message);

  return triggers.some((trigger) => {
    if (trigger.startsWith("contains:")) {
      const term = trigger.replace("contains:", "").trim();
      return term.length > 0 && normalizedMessage.includes(term);
    }

    return normalizedMessage === trigger || normalizedMessage.includes(trigger);
  });
}

function sortFlows(a: BotFlow, b: BotFlow) {
  if (a.prioridade !== b.prioridade) {
    return a.prioridade - b.prioridade;
  }

  return b.gatilho.length - a.gatilho.length;
}

export async function findMatchingFlow(instanceId: string, message: string) {
  if (!db) {
    logger.warn("DATABASE_URL not configured for bot flows; using fallback automation");
    return null;
  }

  try {
    const result = await db.query<BotFlow>(
      `
        SELECT id, nome, descricao, "instanceId", gatilho, resposta, ativo, prioridade
        FROM "BotFlow"
        WHERE ativo = true
          AND ("instanceId" = $1 OR "instanceId" IS NULL)
        ORDER BY prioridade ASC, "createdAt" DESC
      `,
      [instanceId]
    );

    const instanceFlows = result.rows
      .filter((flow) => flow.instanceId === instanceId)
      .sort(sortFlows);
    const globalFlows = result.rows
      .filter((flow) => flow.instanceId === null)
      .sort(sortFlows);

    const allFlows = [...instanceFlows, ...globalFlows];
    return allFlows.find((flow) => triggerMatches(flow.gatilho, message)) || null;
  } catch (error) {
    logger.error({ error }, "Failed to load bot flows from database");
    return null;
  }
}
