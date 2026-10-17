// Laço do agente: o modelo conversa e pede ferramentas; o código executa e devolve o resultado.
// Independente do provedor: o Gemini entra por `ModelClient` (e um modelo falso nos testes).

export type AgentPart = Record<string, unknown>;
export type AgentContent = { role: "user" | "model"; parts: AgentPart[] };

export type ModelTurn = {
  text: string;
  functionCalls: Array<{ name: string; args: Record<string, unknown> }>;
  /** Conteúdo do modelo exatamente como veio (preserva assinaturas de raciocínio do Gemini). */
  modelContent: AgentContent;
};

export type ModelClient = {
  generate(contents: AgentContent[]): Promise<ModelTurn>;
};

export type ToolCallRecord = {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  ms: number;
};

export type AgentRunResult = {
  /** Texto final para o cliente (pode ser vazio, ex.: depois do resumo oficial). */
  reply: string;
  toolCalls: ToolCallRecord[];
  rounds: number;
  /** Passou do limite de rodadas sem uma resposta final. */
  exceededRounds: boolean;
  /** A resposta citava valores sem fonte e continuou assim após as correções: não deve ser enviada. */
  blocked: boolean;
};

export async function runAgentLoop(options: {
  model: ModelClient;
  history: AgentContent[];
  runTool: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  maxRounds?: number;
  /**
   * Confere a resposta final antes de enviar. Devolve um aviso (texto) se ela não pode ser enviada;
   * o aviso volta ao modelo para ele reescrever. Depois de `maxCorrections` tentativas, a resposta é barrada.
   */
  verifyReply?: (reply: string, toolCalls: ToolCallRecord[]) => string | null;
  maxCorrections?: number;
}): Promise<AgentRunResult> {
  const maxRounds = options.maxRounds ?? 8;
  const contents = [...options.history];
  const toolCalls: ToolCallRecord[] = [];
  const maxCorrections = options.maxCorrections ?? 2;
  let corrections = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    const turn = await options.model.generate(contents);

    if (turn.functionCalls.length === 0) {
      const reply = turn.text.trim();
      const problem = reply ? options.verifyReply?.(reply, toolCalls) ?? null : null;
      if (!problem) {
        return { reply, toolCalls, rounds: round, exceededRounds: false, blocked: false };
      }
      if (corrections >= maxCorrections) {
        return { reply: "", toolCalls, rounds: round, exceededRounds: false, blocked: true };
      }
      corrections += 1;
      contents.push(turn.modelContent, { role: "user", parts: [{ text: problem }] });
      continue;
    }

    contents.push(turn.modelContent);
    const responses: AgentPart[] = [];
    for (const call of turn.functionCalls) {
      const started = Date.now();
      const result = await options.runTool(call.name, call.args);
      toolCalls.push({ name: call.name, args: call.args, result, ms: Date.now() - started });
      responses.push({ functionResponse: { name: call.name, response: result } });
    }
    contents.push({ role: "user", parts: responses });
  }

  return { reply: "", toolCalls, rounds: maxRounds, exceededRounds: true, blocked: false };
}

/** Histórico da conversa → conteúdos do modelo, juntando mensagens seguidas do mesmo lado. */
export function historyToContents(messages: Array<{ kind: "in" | "out"; content: string }>): AgentContent[] {
  const contents: AgentContent[] = [];
  for (const message of messages) {
    const role = message.kind === "in" ? "user" : "model";
    const text = message.content.trim();
    if (!text) continue;
    const last = contents.at(-1);
    if (last && last.role === role) {
      last.parts.push({ text });
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }
  // O Gemini exige começar por uma fala do usuário.
  while (contents.length && contents[0].role === "model") contents.shift();
  return contents;
}
