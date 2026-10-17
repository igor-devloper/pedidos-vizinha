import { config } from "../config.js";
import {
  getRecentMessages,
  hasOutboundMessage,
  logMessage,
  pauseConversation,
} from "../conversation-repository.js";
import { instanceManager } from "../instance-manager.js";
import { updateLead, type BotLead } from "../lead-repository.js";
import { logger } from "../logger.js";
import { listActiveProducts } from "../product-repository.js";
import type { InboundMessageJob } from "../types.js";
import { patchDraft, resetDraft, type WhatsappDraft } from "../whatsapp-draft-repository.js";
import { buildOwnerHandoffAlertMessage } from "../whatsapp-format.js";
import { historyToContents, runAgentLoop, type AgentContent } from "./agent-loop.js";
import {
  addMoneyFromToolResult,
  buildCorrectionNotice,
  catalogMoney,
  findUnverifiedMoney,
  needsMenuAfterReply,
} from "./guard.js";
import type { AgentProduct } from "./cart.js";
import { createGeminiModel } from "./gemini-model.js";
import { buildSystemPrompt } from "./prompt.js";
import { createSiteApi, type StoreInfo } from "./site-api.js";
import { deliveryFeesFrom } from "./delivery-area.js";
import { extractPayment } from "./payment-parse.js";
import { isRepeatingItself } from "./repetition.js";
import { describeDraft, missingFields, type DraftState } from "./state.js";
import { buildMenuMessage, executeTool, isClearConfirmation, type ToolDeps } from "./tools.js";

const FALLBACK_REPLY =
  "Desculpe, tive um probleminha aqui. Pode me mandar sua mensagem de novo, por favor? Se preferir, a Vizinha também pode te atender.";
const CONFUSED_REPLY = "Desculpe, não entendi direito. Pode me explicar de outro jeito?";
const OWNER_FAILURE_ALERT_COOLDOWN_MS = 30 * 60_000;

let lastOwnerFailureAlertAt = 0;
const site = createSiteApi();

export function ownerJid() {
  return `${config.ownerApprovalNumber.replace(/\D/g, "")}@s.whatsapp.net`;
}

function customerLabel(job: InboundMessageJob, lead: BotLead | null, draft: DraftState) {
  return draft.customerName || lead?.nome || job.pushName || lead?.pushName || draft.phone || job.remoteJid;
}

async function buildStoreLine(): Promise<{ line: string; info: StoreInfo | null }> {
  try {
    const info = await site.storeInfo();
    const status = info.closedByOwner
      ? "A loja está FECHADA no painel hoje (não recebe encomendas para hoje, mas aceita para outros dias)"
      : info.openNow
        ? `A loja está ABERTA agora (hoje ${info.todayHours})`
        : `A loja está FECHADA agora (hoje: ${info.todayHours}); aceita encomendas para dias de funcionamento`;
    return {
      line: `${status}. Próximos dias disponíveis: ${info.nextOpenDays.join("; ") || "consulte ver_horarios"}`,
      info,
    };
  } catch (error) {
    logger.warn({ error }, "Could not load store info for the agent prompt");
    return { line: "Status da loja indisponível agora: use ver_horarios antes de afirmar horários.", info: null };
  }
}

/**
 * Resposta fixa depois de registrar o pagamento. Devolve null quando o modelo deve continuar
 * (falta algo que não é pagamento, ou o resumo não pôde ser montado).
 */
async function buildPaymentReply(
  result: Record<string, unknown>,
  stillMissing: string[],
  args: { percentual?: number; forma?: string },
  deps: ToolDeps,
): Promise<string[] | null> {
  if (result.ok === false) {
    return [`${String(result.erro)}\n\nPode ser pagando *100%* agora? Se sim, me diga também se prefere *Pix*, *cartão de crédito* ou *cartão de débito*. 😊`];
  }

  const needPercent = stillMissing.some((field) => /50% ou 100%/.test(field));
  const needMethod = stillMissing.some((field) => /forma de pagamento/.test(field));
  const onlyPaymentLeft = stillMissing.every((field) => /50% ou 100%|forma de pagamento/.test(field));
  if (!onlyPaymentLeft) return null;

  if (needPercent && needMethod) return null;
  if (needPercent) return [`Anotei! Você prefere pagar *50%* agora ou *100%*? 😊`];
  if (needMethod) return [`Anotei *${args.percentual}%*! E a forma de pagamento: *Pix*, *cartão de crédito* ou *cartão de débito*? 😊`];

  // Pagamento completo e pedido completo: o resumo oficial sai direto.
  const summary = await executeTool("ver_resumo", {}, deps);
  return summary.ok === false ? null : [];
}

/** Pausa o bot na conversa e avisa a Vizinha. Usado pela ferramenta chamar_humano. */
export async function handOffToHuman(job: InboundMessageJob, lead: BotLead | null, draft: DraftState, reason: string) {
  await pauseConversation(job.instanceId, job.remoteJid, config.handoffPauseHours, reason, "agent");
  await patchDraft(draft.id, { status: "HANDOFF", stage: "HANDOFF", whatsappOfferDueAt: null });
  if (lead) {
    await updateLead(lead.id, { stage: "human_handoff", status: "handoff", lastInboundText: job.text });
  }

  const alert = [
    buildOwnerHandoffAlertMessage(customerLabel(job, lead, draft), job.text, lead?.lastOutboundText),
    `📝 *Motivo:* ${reason}`,
    `⏸️ O bot ficará pausado nesta conversa por ${config.handoffPauseHours}h. Para retomar antes, use o painel.`,
  ].join("\n\n");
  await instanceManager.sendText(job.instanceId, config.ownerApprovalNumber, alert).catch((error) => {
    logger.error({ error }, "Failed to alert the owner about a handoff");
  });
}

/**
 * Um turno do agente: monta o contexto, deixa o Gemini conversar e chamar ferramentas, e envia
 * a resposta. O pedido só muda por ferramentas; o código valida tudo.
 */
export async function handleAgentTurn(
  job: InboundMessageJob,
  lead: BotLead | null,
  initialDraft: WhatsappDraft,
  options: { draftExpired?: boolean } = {},
) {
  let draft: WhatsappDraft = initialDraft;
  let sentCount = 0;

  const send = async (text: string) => {
    if (!text.trim()) return;
    await instanceManager.sendText(job.instanceId, job.remoteJid, text);
    sentCount += 1;
  };

  const products = (await listActiveProducts()) as AgentProduct[];
  if (products.length === 0) {
    logger.error({ instanceId: job.instanceId }, "No active products; handing the conversation to the owner");
    await handOffToHuman(job, lead, draft, "Não consegui carregar o cardápio do banco.");
    await send("Um instante, vou chamar a Vizinha para te ajudar. 🙏");
    return;
  }

  const { line: storeLine, info: storeInfo } = await buildStoreLine();
  const firstContact = !(await hasOutboundMessage(job.instanceId, job.remoteJid));

  // Mensagens que seguem a resposta do modelo (o cardápio vem logo depois da saudação).
  const afterReply: string[] = [];

  const deps: ToolDeps = {
    products,
    getDraft: () => draft,
    async patchDraft(patch) {
      draft = (await patchDraft(draft.id, patch)) ?? draft;
      return draft;
    },
    async resetDraft() {
      draft = (await resetDraft(draft)) ?? draft;
      return draft;
    },
    api: site,
    send,
    sendAfterReply: (text) => {
      afterReply.push(text);
    },
    async notifyOwner(text) {
      await instanceManager.sendText(job.instanceId, config.ownerApprovalNumber, text).catch((error) => {
        logger.error({ error }, "Failed to notify the owner");
      });
    },
    handoff: (reason) => handOffToHuman(job, lead, draft, reason),
    lastCustomerText: () => job.text,
    now: () => new Date(),
    business: {
      name: config.businessName,
      cardapioUrl: config.cardapioUrl,
      pickupAddress: config.pickupAddress,
      pickupReference: config.pickupReference,
    },
  };

  const history = historyToContents(
    (await getRecentMessages(job.instanceId, job.remoteJid, config.agentHistoryLimit)) as Array<{ kind: "in" | "out"; content: string }>,
  );
  if (history.at(-1)?.role !== "user") {
    // O pipeline registra a mensagem antes do turno; este é só um reforço de segurança.
    history.push({ role: "user", parts: [{ text: job.text }] } satisfies AgentContent);
  }

  // O cliente confirmou o resumo: o código cria o pedido e envia o link/Pix. Não depende de o modelo chamar a ferramenta
  // (ele chegou a dizer "pedido finalizado, instruções enviadas" sem ter gerado nada).
  if (draft.stage === "AWAITING_CONFIRMATION" && draft.summarySentAt && !draft.orderId && isClearConfirmation(job.text)) {
    const result = await executeTool("finalizar_pedido", {}, deps);
    await logMessage(job.instanceId, job.remoteJid, "tool", "finalizar_pedido", { args: {}, result, auto: true });
    logger.info({ instanceId: job.instanceId, ok: result.ok !== false, erro: result.erro }, "Order confirmation handled by code");
    if (result.ok !== false) {
      await send("Assim que o pagamento for confirmado, eu aviso por aqui. Obrigada! 😊");
      return;
    }
    if (result.tentarNovamente) {
      await send("Tive um probleminha técnico para gerar o pagamento, mas seu pedido está salvo. Me diga *tente novamente* que eu tento de novo. 🙏");
      return;
    }
    history.at(-1)?.parts.push({ text: `[Sistema] Não foi possível criar o pedido: ${String(result.erro)}. Explique ao cliente e ajuste o necessário.` });
  }

  // Pedido completo e só falta o pagamento: "50", "50% no crédito", "pix" etc. são registrados pelo código,
  // sem depender de o modelo lembrar de chamar a ferramenta (ele chegou a repetir a pergunta em loop).
  const pending = missingFields(draft, products);
  const onlyPaymentMissing = pending.length > 0 && pending.every((field) => /50% ou 100%|forma de pagamento/.test(field));
  // Também vale quando a última fala do bot perguntou sobre pagamento, mesmo que falte outro dado no rascunho.
  const lastBotText = [...history].reverse().find((content) => content.role === "model")?.parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join(" ") ?? "";
  const botAskedPayment = /pagar|pagamento|\bpix\b|cr[eé]dito|d[eé]bito/i.test(lastBotText);
  const choice = onlyPaymentMissing || botAskedPayment ? extractPayment(job.text) : {};
  if (choice.percentual || choice.forma) {
    const args = { ...choice };
    const result = await executeTool("definir_pagamento", args, deps);
    await logMessage(job.instanceId, job.remoteJid, "tool", "definir_pagamento", { args, result, auto: true });
    const stillMissing = (result.faltaPreencher as string[] | undefined) ?? [];
    logger.info(
      { instanceId: job.instanceId, args, ok: result.ok !== false, erro: result.erro, stillMissing },
      "Payment applied from the customer's message",
    );

    // O passo de pagamento é respondido pelo código: não depende de o modelo entender a resposta.
    const paymentReply = await buildPaymentReply(result, stillMissing, args, deps);
    if (paymentReply !== null) {
      for (const text of paymentReply) await send(text);
      return;
    }

    const outcome = result.ok === false
      ? `não foi aceito: ${String(result.erro)}`
      : `registrado. Ainda falta: ${stillMissing.join(", ") || "nada"}`;
    history.at(-1)?.parts.push({
      text: `[Sistema] O pagamento informado pelo cliente nesta mensagem foi ${outcome}. Não repita a pergunta sobre o que já foi registrado.`,
    });
  }

  // Modelo preso em loop (repetindo quase a mesma fala): corta o histórico para ele reler só a mensagem atual.
  if (isRepeatingItself(history)) {
    logger.warn({ instanceId: job.instanceId }, "Agent history is repetitive; sending only the latest customer message");
    const last = history.at(-1);
    history.length = 0;
    history.push({
      role: "user",
      parts: [
        ...(last?.parts ?? [{ text: job.text }]),
        { text: "[Sistema] Suas últimas respostas estavam repetidas. Leia a mensagem do cliente com atenção e use as ferramentas para registrar o que ele pediu." },
      ],
    });
  }

  const model = createGeminiModel(
    buildSystemPrompt({
      businessName: config.businessName,
      cardapioUrl: config.cardapioUrl,
      now: new Date(),
      firstContact,
      storeLine,
      draftSnapshot: describeDraft(draft, products),
      draftExpired: Boolean(options.draftExpired),
    }),
  );

  // Valores em reais que o modelo pode citar: cardápio, taxas de entrega, retratos do pedido e
  // resultados das ferramentas. Qualquer outro valor é invenção e a resposta é barrada.
  const allowedMoney = catalogMoney(products);
  for (const area of storeInfo ? deliveryFeesFrom(storeInfo) : []) allowedMoney.add(Number(area.fee.toFixed(2)));

  try {
    const result = await runAgentLoop({
      model,
      history,
      runTool: async (name, args) => {
        const result = await executeTool(name, args, deps);
        addMoneyFromToolResult(allowedMoney, result);
        await logMessage(job.instanceId, job.remoteJid, "tool", name, { args, result });
        return result;
      },
      verifyReply: (reply, toolCalls) => {
        const claimsOrderDone = /(pedido (j[aá] )?(foi |est[aá] )?(finalizado|criado|confirmado|registrado)|instru[cç][oõ]es (de|para o) pagamento (j[aá] )?foram enviadas|link de pagamento (j[aá] )?(foi enviado|est[aá] acima))/i.test(reply);
        const orderCreated = Boolean(draft.orderId) || toolCalls.some((call) => call.name === "finalizar_pedido" && call.result.ok !== false);
        if (claimsOrderDone && !orderCreated) {
          logger.warn({ instanceId: job.instanceId }, "Agent claimed the order was finalized without creating it; asking for a rewrite");
          return "[Aviso do sistema] Você disse que o pedido foi finalizado, mas nenhum pedido foi criado e nenhum pagamento foi enviado. Não afirme isso. Se o cliente confirmou o resumo, chame finalizar_pedido; senão, diga o que ainda falta.";
        }
        const known = new Set(allowedMoney);
        addMoneyFromToolResult(known, describeDraft(draft, products));
        const unverified = findUnverifiedMoney(reply, known);
        if (unverified.length === 0) return null;
        logger.warn({ instanceId: job.instanceId, unverified }, "Agent reply quoted unverified prices; asking for a rewrite");
        return buildCorrectionNotice(unverified);
      },
    });

    logger.info(
      {
        instanceId: job.instanceId,
        remoteJid: job.remoteJid,
        tools: result.toolCalls.map((call) => `${call.name}:${call.result.ok === false ? "erro" : "ok"}`),
        rounds: result.rounds,
      },
      "Agent turn finished"
    );

    if (result.exceededRounds) {
      await logMessage(job.instanceId, job.remoteJid, "event", "O agente passou do limite de rodadas de ferramentas");
      await handOffToHuman(job, lead, draft, "O assistente não conseguiu concluir o atendimento sozinho.");
      await send("Vou chamar a Vizinha para te ajudar com isso, ela continua por aqui em breve. 🙏");
      return;
    }

    if (result.blocked) {
      await logMessage(job.instanceId, job.remoteJid, "event", "Resposta barrada: citava valores que não vieram do cardápio");
      afterReply.length = 0;
      await send("Um instante! Vou te mostrar o nosso cardápio certinho. 😊");
      await send(buildMenuMessage(products, deps.business));
      return;
    }

    if (result.reply) {
      await send(result.reply);
    }

    // Primeiro contato: o cardápio sempre sai pelo código, mesmo que o modelo não peça.
    if (needsMenuAfterReply(firstContact, result.toolCalls.map((call) => call.name))) {
      afterReply.push(buildMenuMessage(products, deps.business));
    }
    for (const message of afterReply) await send(message);

    if (!result.reply && sentCount === 0) {
      await send(CONFUSED_REPLY);
    }
  } catch (error) {
    logger.error({ error, instanceId: job.instanceId, remoteJid: job.remoteJid }, "Agent turn failed");
    await logMessage(job.instanceId, job.remoteJid, "event", `Falha do agente: ${error instanceof Error ? error.message : String(error)}`);
    if (sentCount === 0) await send(FALLBACK_REPLY);

    // Avisa a Vizinha (no máximo a cada 30 min) para ela saber que o assistente está com problema.
    if (Date.now() - lastOwnerFailureAlertAt > OWNER_FAILURE_ALERT_COOLDOWN_MS) {
      lastOwnerFailureAlertAt = Date.now();
      await instanceManager
        .sendText(
          job.instanceId,
          config.ownerApprovalNumber,
          `⚠️ O assistente de pedidos teve um erro ao atender ${customerLabel(job, lead, draft)}. Confira a conversa no painel.`
        )
        .catch(() => undefined);
    }
  }
}
