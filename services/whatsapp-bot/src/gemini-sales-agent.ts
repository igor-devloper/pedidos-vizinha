import { GoogleGenAI } from "@google/genai";

import { config } from "./config.js";
import { logger } from "./logger.js";
import type { BotLead } from "./lead-repository.js";
import { listActiveProducts } from "./product-repository.js";
import type { ProductRecord } from "./product-repository.js";
import type { InboundMessageJob } from "./types.js";

type AgentResult = {
  reply: string;
  stage?: string;
  status?: string;
  intent?: string;
  nome?: string;
  eventoDetalhes?: string;
  horarioEntrega?: string;
  menuCategoria?: "CENTO" | "LANCHONETE" | "COMBO";
  bairroRetirada?: string;
  observacoes?: string;
  shouldRespond: boolean;
};

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeAgentResult(raw: AgentResult) {
  const menuCategoria =
    raw.menuCategoria === "CENTO" ||
    raw.menuCategoria === "LANCHONETE" ||
    raw.menuCategoria === "COMBO"
      ? raw.menuCategoria
      : undefined;

  const status = ["open", "qualified", "closed", "handoff"].includes(raw.status || "")
    ? raw.status
    : undefined;

  return {
    shouldRespond: raw.shouldRespond !== false,
    reply: normalizeOptionalText(raw.reply) || "",
    stage: normalizeOptionalText(raw.stage),
    status,
    intent: normalizeOptionalText(raw.intent),
    nome: normalizeOptionalText(raw.nome),
    eventoDetalhes: normalizeOptionalText(raw.eventoDetalhes),
    horarioEntrega: normalizeOptionalText(raw.horarioEntrega),
    menuCategoria,
    bairroRetirada: normalizeOptionalText(raw.bairroRetirada),
    observacoes: normalizeOptionalText(raw.observacoes),
  } satisfies AgentResult;
}

const ai = config.geminiApiKey
  ? new GoogleGenAI({ apiKey: config.geminiApiKey })
  : null;

function parseJsonObject(text: string) {
  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]) as AgentResult;
  } catch {
    return null;
  }
}

function formatProductsForPrompt(products: Awaited<ReturnType<typeof listActiveProducts>>) {
  if (products.length === 0) {
    return "Nenhum produto encontrado no banco.";
  }

  return products
    .map(
      (product: ProductRecord) =>
        `- ${product.emPromocao ? "[PROMOÇÃO] " : ""}${product.nome} | R$ ${product.preco} | ${product.descricao}`
    )
    .join("\n");
}

function buildLeadSnapshot(lead: BotLead | null) {
  if (!lead) {
    return "Lead novo, sem histórico.";
  }

  return [
    `stage: ${lead.stage}`,
    `status: ${lead.status}`,
    `nome: ${lead.nome || ""}`,
    `horarioEntrega: ${lead.horarioEntrega || ""}`,
    `menuCategoria: ${lead.menuCategoria || ""}`,
    `intent: ${lead.intent || ""}`,
    `eventoDetalhes: ${lead.eventoDetalhes || ""}`,
    `bairroRetirada: ${lead.bairroRetirada || ""}`,
    `observacoes: ${lead.observacoes || ""}`,
    `lastInboundText: ${lead.lastInboundText || ""}`,
    `lastOutboundText: ${lead.lastOutboundText || ""}`,
  ].join("\n");
}

function buildPrompt(job: InboundMessageJob, lead: BotLead | null, products: ProductRecord[]) {
  return `
Você é a atendente virtual da ${config.businessName}.

Seu papel:
- responder em português do Brasil;
- falar de forma humana, simpática e natural no WhatsApp;
- tirar dúvidas com flexibilidade;
- ajudar o cliente a entender produtos, preços, promoções e horários;
- orientar o cliente a fazer o pedido exclusivamente no site ${config.cardapioUrl};
- usar somente os produtos e preços fornecidos;
- nunca inventar itens fora do cardápio.

Regras importantes:
- se o cliente pedir o cardápio, mande primeiro o link oficial do cardápio: ${config.cardapioUrl};
- junto com o link, você pode destacar poucas promoções em texto com preço, sem despejar o cardápio inteiro no WhatsApp;
- se o cliente quiser encomendar, deixe claro que o pedido deve ser feito no site;
- nunca monte o pedido por mensagem, nunca colete o pedido completo por WhatsApp e nunca diga que vai fechar a encomenda por aqui;
- se o cliente tiver dúvidas, responda de forma livre e útil;
- se o cliente mandar comprovante, Pix, imagem ou áudio falando de pagamento, reconheça o contexto e explique que a confirmação chega no WhatsApp após a validação;
- avise que há tolerância de 15 minutos de atraso para ambas as partes;
- prefira manter o stage como "awaiting_intent" ou "site_order_guided" quando o cliente estiver em fase de compra;
- use "qualified" quando a conversa estiver avançada e "open" no restante.

Dados do negócio:
- endereço/base: ${config.pickupAddress}
- referência: ${config.pickupReference || "Não informada"}
- horário-base: ${config.pickupHours}

Produtos ativos:
${formatProductsForPrompt(products)}

Contexto atual do lead:
${buildLeadSnapshot(lead)}

Mensagem recebida agora:
${job.text}

Responda SOMENTE em JSON válido, sem markdown fora do JSON, neste formato:
{
  "shouldRespond": true,
  "reply": "texto da resposta para o cliente",
  "stage": "awaiting_intent|site_order_guided|outro-stage-atual",
  "status": "open|qualified|closed|handoff",
  "intent": "encomenda|valores|duvida|pagamento",
  "nome": "nome se apareceu de forma útil",
  "eventoDetalhes": "detalhes se for útil guardar",
  "horarioEntrega": "horario se for útil guardar",
  "menuCategoria": "CENTO|LANCHONETE|COMBO se ficar claro",
  "bairroRetirada": "bairro ou retirada se fizer sentido",
  "observacoes": "observacoes extras se necessário"
}
`;
}

export async function runSalesAgent(job: InboundMessageJob, lead: BotLead | null) {
  if (!ai) {
    return null;
  }

  const products = await listActiveProducts();
  const prompt = buildPrompt(job, lead, products);

  try {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: prompt,
    });

    const text = response.text || "";
    const parsed = parseJsonObject(text);
    const sanitized = parsed ? sanitizeAgentResult(parsed) : null;

    if (!sanitized?.reply || sanitized.shouldRespond === false) {
      logger.warn(
        {
          instanceId: job.instanceId,
          remoteJid: job.remoteJid,
          rawAgentText: text,
        },
        "Gemini agent returned invalid or empty response"
      );
      return null;
    }

    logger.info(
      {
        instanceId: job.instanceId,
        remoteJid: job.remoteJid,
        stage: sanitized.stage,
        status: sanitized.status,
        intent: sanitized.intent,
      },
      "Gemini sales agent produced a response"
    );

    return sanitized;
  } catch (error) {
    logger.error({ error }, "Gemini sales agent failed");
    return null;
  }
}
