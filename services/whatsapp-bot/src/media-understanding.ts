import { GoogleGenAI } from "@google/genai";

import { config } from "./config.js";
import { logger } from "./logger.js";
import type { InboundMessageJob } from "./types.js";

type MediaAnalysis = {
  extractedText: string;
  summary: string;
  containsPaymentProof: boolean;
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
    return JSON.parse(match[0]) as MediaAnalysis;
  } catch {
    return null;
  }
}

function normalizeMediaAnalysis(raw: MediaAnalysis | null) {
  if (!raw) {
    return null;
  }

  return {
    extractedText:
      typeof raw.extractedText === "string" ? raw.extractedText.trim() : "",
    summary: typeof raw.summary === "string" ? raw.summary.trim() : "",
    containsPaymentProof: raw.containsPaymentProof === true,
  } satisfies MediaAnalysis;
}

function buildPrompt(job: InboundMessageJob) {
  if (job.mediaKind === "audio") {
    return `Você está analisando um áudio recebido no WhatsApp da ${config.businessName}.

Tarefas:
- transcreva o áudio em português do Brasil da forma mais fiel possível;
- resuma em uma frase curta o que a pessoa quis dizer;
- marque containsPaymentProof como true apenas se o áudio indicar claramente pagamento, Pix, comprovante ou transferência já realizada.

Responda SOMENTE em JSON válido:
{
  "extractedText": "transcrição",
  "summary": "resumo curto",
  "containsPaymentProof": false
}`;
  }

  return `Você está analisando uma imagem recebida no WhatsApp da ${config.businessName}.

Tarefas:
- faça OCR e extraia o texto relevante visível;
- resuma em uma frase curta o que a imagem mostra;
- marque containsPaymentProof como true apenas se parecer comprovante de Pix, transferência, pagamento ou tela bancária de confirmação.

Responda SOMENTE em JSON válido:
{
  "extractedText": "texto encontrado na imagem",
  "summary": "resumo curto",
  "containsPaymentProof": false
}`;
}

export async function enrichInboundMedia(job: InboundMessageJob) {
  if (!ai || !job.mediaBase64 || !job.mediaKind || !job.mediaMimeType) {
    return job;
  }

  try {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(job) },
            {
              inlineData: {
                mimeType: job.mediaMimeType,
                data: job.mediaBase64,
              },
            },
          ],
        },
      ] as never,
    });

    const parsed = normalizeMediaAnalysis(parseJsonObject(response.text || ""));

    if (!parsed) {
      return job;
    }

    const extractedParts = [
      job.originalText?.trim() || "",
      parsed.extractedText,
      parsed.summary,
      parsed.containsPaymentProof ? "comprovante pix pagamento pago" : "",
    ].filter(Boolean);

    const nextText = extractedParts.join("\n").trim();

    logger.info(
      {
        instanceId: job.instanceId,
        remoteJid: job.remoteJid,
        mediaKind: job.mediaKind,
        containsPaymentProof: parsed.containsPaymentProof,
        extractedPreview: parsed.extractedText.slice(0, 160),
      },
      "Inbound media analyzed"
    );

    return {
      ...job,
      text: nextText || job.text,
    };
  } catch (error) {
    logger.error(
      {
        error,
        instanceId: job.instanceId,
        remoteJid: job.remoteJid,
        mediaKind: job.mediaKind,
      },
      "Failed to analyze inbound media"
    );

    return job;
  }
}
