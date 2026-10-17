import { FunctionCallingConfigMode, GoogleGenAI } from "@google/genai";

import { config } from "../config.js";
import { logger } from "../logger.js";
import type { AgentContent, ModelClient, ModelTurn } from "./agent-loop.js";
import { TOOL_DECLARATIONS } from "./tools.js";

const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type RawPart = {
  text?: string;
  thought?: boolean;
  functionCall?: { name?: string; args?: Record<string, unknown> };
};

/** Gemini com function calling (ferramentas) e instrução de sistema. */
export function createGeminiModel(systemInstruction: string): ModelClient {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY não configurada");
  }
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  return {
    async generate(contents: AgentContent[]): Promise<ModelTurn> {
      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const response = await ai.models.generateContent({
            model: config.geminiModel,
            contents: contents as never,
            config: {
              systemInstruction,
              temperature: 0.3,
              tools: [{ functionDeclarations: TOOL_DECLARATIONS as never }],
              toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            },
          });

          const candidate = response.candidates?.[0];
          const parts = (candidate?.content?.parts ?? []) as RawPart[];
          const functionCalls = parts.flatMap((part) =>
            part.functionCall?.name ? [{ name: part.functionCall.name, args: part.functionCall.args ?? {} }] : [],
          );
          const text = parts
            .filter((part) => typeof part.text === "string" && !part.thought)
            .map((part) => part.text)
            .join("");

          if (!candidate?.content) {
            logger.warn({ finishReason: candidate?.finishReason }, "Gemini returned no content");
          }

          return {
            text,
            functionCalls,
            modelContent: (candidate?.content ?? { role: "model", parts: [] }) as AgentContent,
          };
        } catch (error) {
          lastError = error;
          logger.warn({ error, attempt }, "Gemini request failed");
          if (attempt < MAX_ATTEMPTS) await sleep(800 * attempt);
        }
      }
      throw lastError instanceof Error ? lastError : new Error("Gemini request failed");
    },
  };
}
