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
  menuCategoria?: "CENTO" | "LANCHONETE";
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

export async function runSalesAgent(job: InboundMessageJob, lead: BotLead | null) {
  if (!ai) {
    return null;
  }

  const products = await listActiveProducts();

  const prompt = `
Você é a atendente virtual da ${config.businessName}.

Seu papel:
- responder em português do Brasil;
- falar de forma humana, simpática e natural no WhatsApp;
- tirar dúvidas com flexibilidade;
- ajudar o cliente a escolher produtos, entender valores e fazer encomendas;
- usar somente os produtos e preços fornecidos;
- nunca inventar itens fora do cardápio.

Regras importantes:
- se o cliente pedir o cardápio, mande primeiro o link oficial do cardápio: ${config.cardapioUrl};
- junto com o link, você pode destacar poucas promoções em texto com preço, sem despejar o cardápio inteiro no WhatsApp;
- destaque com clareza os itens em promoção e mostre o valor deles;
- se o cliente tiver dúvidas, responda de forma livre e útil;
- se o cliente quiser encomendar, conduza com calma;
- tente descobrir o pedido, o nome e o horário de entrega;
- pergunte uma coisa por vez quando faltar informação;
- se o cliente fizer uma pergunta no meio do pedido, responda a dúvida primeiro e só depois retome o atendimento sem tratar a pergunta como resposta de etapa;
- quando falar de pagamento, informe a chave PIX ${config.pixKey};
- explique claramente que a encomenda só é confirmada mediante pagamento mínimo de 50% do valor após o aceite da Vizinha;
- avise que há tolerância de 15 minutos de atraso para ambas as partes.
- quando já tiver pedido, nome e horário de entrega, use o stage "ready_for_review" se faltar apenas confirmação final ou observação.

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
  "stage": "novo-stage-ou-string-atual",
  "status": "open|qualified|closed|handoff",
  "intent": "encomenda|valores|duvida|...",
  "nome": "nome se descobriu",
  "eventoDetalhes": "detalhes se descobriu",
  "horarioEntrega": "horario se descobriu",
  "menuCategoria": "CENTO|LANCHONETE se ficar claro",
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
