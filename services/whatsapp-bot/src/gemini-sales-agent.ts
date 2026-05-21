import { GoogleGenAI } from "@google/genai";

import { config } from "./config.js";
import { logger } from "./logger.js";
import type { BotLead } from "./lead-repository.js";
import { listActiveProducts } from "./product-repository.js";
import type { InboundMessageJob } from "./types.js";
import type { ProductRecord } from "./product-repository.js";

type AgentResult = {
  reply: string;
  stage?: string;
  status?: string;
  intent?: string;
  nome?: string;
  eventoDetalhes?: string;
  bairroRetirada?: string;
  observacoes?: string;
  shouldRespond: boolean;
};

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

function formatProductsForPrompt(
  products: Awaited<ReturnType<typeof listActiveProducts>>
) {
  if (products.length === 0) {
    return "Nenhum produto encontrado no banco.";
  }

  return products
    .map(
      (product: ProductRecord) =>
        `- [${product.categoria}] ${product.nome} | R$ ${product.preco} | ${product.descricao}`
    )
    .join("\n");
}

function buildLeadSnapshot(lead: BotLead | null) {
  if (!lead) {
    return "Lead novo, sem historico.";
  }

  return [
    `stage: ${lead.stage}`,
    `status: ${lead.status}`,
    `nome: ${lead.nome || ""}`,
    `menuCategoria: ${lead.menuCategoria || ""}`,
    `horarioEntrega: ${lead.horarioEntrega || ""}`,
    `intent: ${lead.intent || ""}`,
    `eventoDetalhes: ${lead.eventoDetalhes || ""}`,
    `bairroRetirada: ${lead.bairroRetirada || ""}`,
    `observacoes: ${lead.observacoes || ""}`,
    `lastInboundText: ${lead.lastInboundText || ""}`,
    `lastOutboundText: ${lead.lastOutboundText || ""}`,
  ].join("\n");
}

export async function runSalesAgent(job: InboundMessageJob, lead: BotLead | null) {
  if (!ai) {
    return null;
  }

  const products = await listActiveProducts();

  const prompt = `
Você é a atendente virtual da ${config.businessName}.

Seu papel:
- vender com simpatia, flexibilidade e calma;
- responder em português do Brasil;
- falar de forma humana e natural no WhatsApp;
- usar emojis com moderacao;
- usar *negrito* quando fizer sentido;
- conduzir a conversa até o fechamento da encomenda;
- ajudar o cliente sem transferir para um humano, sempre que possível.

Regras obrigatorias:
- use somente os produtos e preços fornecidos;
- respeite as categorias CENTO e LANCHONETE;
- se o cliente perguntar sobre sabor, tipo ou valor, responda com base nos produtos;
- tente descobrir: o que o cliente quer, a categoria do cardápio, a quantidade aproximada, o horário de entrega e o nome;
- se faltar informação, pergunte uma coisa por vez;
- se o cliente quiser encomendar, conduza para fechamento com resumo;
- explique que a encomenda passa pelo aceite da Vizinha e só é confirmada depois do pagamento total ou da metade;
- avise que existe tolerância de 15 minutos de atraso para ambas as partes;
- não invente produtos fora da lista;
- seja comercial, mas sem pressa e sem parecer robótica.

Dados fixos do negocio:
- cardápio: ${config.cardapioUrl}
- retirada: ${config.pickupAddress}
- referência: ${config.pickupReference || "Não informada"}
- horário de retirada: ${config.pickupHours}

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
  "stage": "novo-stage-ou-string-atual",
  "status": "open|qualified|closed|handoff",
  "intent": "encomenda|valores|duvida|...",
  "nome": "nome se descobriu",
  "eventoDetalhes": "detalhes se descobriu",
  "bairroRetirada": "bairro ou retirada se descobriu",
  "observacoes": "observacoes extras se necessario"
}
`;

  try {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: prompt,
    });

    const text = response.text || "";
    const parsed = parseJsonObject(text);

    if (!parsed?.reply || parsed.shouldRespond === false) {
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
        stage: parsed.stage,
        status: parsed.status,
        intent: parsed.intent,
      },
      "Gemini sales agent produced a response"
    );

    return parsed;
  } catch (error) {
    logger.error({ error }, "Gemini sales agent failed");
    return null;
  }
}
