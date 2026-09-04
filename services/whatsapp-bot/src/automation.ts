import {
  findBotOrderByCode,
  findLatestOpenOrderByCustomer,
  updateBotOrder,
  type BotOrder,
} from "./bot-order-repository.js";
import { config } from "./config.js";
import { findMatchingFlow } from "./flow-repository.js";
import { runSalesAgent } from "./gemini-sales-agent.js";
import { instanceManager } from "./instance-manager.js";
import { getOrCreateLead, updateLead, type BotLead } from "./lead-repository.js";
import { logger } from "./logger.js";
import { formatProductPriceForCustomer, listActiveProducts } from "./product-repository.js";
import type { InboundMessageJob } from "./types.js";
import { getOrCreateDraft, markSiteLinkSent, patchDraft, type WhatsappDraft } from "./whatsapp-draft-repository.js";
import {
  buildAwaitingAnalysisMessage,
  buildAwaitingPaymentReminderMessage,
  buildCatalogOverviewMessage,
  buildConfirmedFollowUpMessage,
  buildCustomerAwaitingPaymentMessage,
  buildCustomerOrderConfirmedMessage,
  buildCustomerOrderRejectedMessage,
  buildFallbackHelpMessage,
  buildHumanHandoffMessage,
  buildMediaRetryMessage,
  buildDeliveryMessage,
  buildOwnerHandoffAlertMessage,
  buildOwnerApprovedAckMessage,
  buildOwnerCommandHelpMessage,
  buildOwnerOrderNotFoundMessage,
  buildOwnerPaidAckMessage,
  buildOwnerPaymentReportedMessage,
  buildOwnerRejectReasonMessage,
  buildOwnerRejectedAckMessage,
  buildPaymentProofGuidanceMessage,
  buildPaymentReportedAckMessage,
  buildPendingApprovalMessage,
  buildSiteOrderInstructionsMessage,
  buildSupportPromptMessage,
  buildWelcomeMessage,
  formatWhatsAppList,
  formatWhatsAppMessage,
} from "./whatsapp-format.js";

function isOutsideBusinessHours(now = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(now);
  const hourMinute = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(hourMinute.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(hourMinute.find((part) => part.type === "minute")?.value || 0);
  const totalMinutes = hour * 60 + minute;
  const map = {
    Sun: { open: 9 * 60, close: 13 * 60 },
    Mon: null,
    Tue: { open: 10 * 60, close: 17 * 60 },
    Wed: { open: 10 * 60, close: 17 * 60 },
    Thu: { open: 10 * 60, close: 17 * 60 },
    Fri: { open: 10 * 60, close: 17 * 60 },
    Sat: { open: 10 * 60, close: 17 * 60 },
  } as const;

  const schedule = map[weekday as keyof typeof map];
  if (!schedule) {
    return true;
  }

  return totalMinutes < schedule.open || totalMinutes > schedule.close;
}

function appendOutsideHoursNotice(text: string) {
  if (!isOutsideBusinessHours()) {
    return text;
  }

  return `${text}\n\n⏰ *Aviso de horario*\nAgora estamos fora do horario de atendimento.\nHorario da Vizinha: ${config.pickupHours}\nSe voce abrir o site neste momento, ele pode aparecer como fechado.`;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeOutboundNumber(value: string) {
  const digits = normalizePhone(value);

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

function isOwnerChat(remoteJid: string) {
  return normalizePhone(remoteJid) === normalizePhone(config.ownerApprovalNumber);
}

function isGreeting(text: string) {
  return ["oi", "ola", "menu", "cardapio", "cardapio por favor"].includes(text);
}

function isMediaPlaceholderText(text: string) {
  return /^\[(audio|image|mensagem) recebida\]$/i.test(text.trim());
}

function hasMeaningfulInboundText(job: InboundMessageJob) {
  return Boolean(job.text.trim()) && !isMediaPlaceholderText(job.text);
}

function isMenuRequest(text: string) {
  return ["cardapio", "menu", "catalogo", "promocao", "promocoes"].some((term) =>
    text.includes(term)
  );
}

function indicatesPayment(text: string) {
  return ["paguei", "pagamento", "pix", "comprovante", "pago", "transferencia"].some((term) =>
    text.includes(term)
  );
}

function parseDraftPayment(text: string) {
  const normalized = normalizeText(text);
  const paymentMethod = normalized.includes("pix")
    ? "PIX"
    : normalized.includes("debito")
      ? "CARTAO_DEBITO"
      : normalized.includes("credito") || normalized.includes("cartao")
        ? "CARTAO_CREDITO"
        : null;
  const paymentPercentage = /(^|\D)50\s*%|metade/.test(normalized)
    ? 50
    : /(^|\D)100\s*%|valor total|tudo/.test(normalized)
      ? 100
      : null;
  return { paymentMethod, paymentPercentage };
}

function normalizeDraftPaymentMethod(value: unknown) {
  const normalized = normalizeText(String(value || ""));
  if (normalized.includes("pix")) return "PIX";
  if (normalized.includes("debito")) return "CARTAO_DEBITO";
  if (normalized.includes("credito") || normalized.includes("cartao")) return "CARTAO_CREDITO";
  return undefined;
}

function getNextDraftQuestion(draft: WhatsappDraft) {
  if (!draft.paymentPercentage) return "Você prefere pagar 50% agora ou o valor total?";
  if (!draft.customerName) return "Qual é o nome de quem vai retirar ou receber o pedido?";
  if (!draft.customerEmail) return "Qual e-mail devemos usar no pagamento?";
  if (!draft.scheduledAt) return "Para qual data e horário você quer o pedido?";
  if (draft.fulfillmentType === "DELIVERY" && !draft.deliveryReference) return "Qual é o ponto de referência da entrega?";
  return "Já tenho os dados principais. Posso mostrar o resumo completo para você confirmar?";
}

function normalizeDraftItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const productId = String(item.productId || item.id || "").trim();
    const requestedUnits = Math.floor(Number(item.requestedUnits ?? item.quantity));
    if (!productId || !Number.isInteger(requestedUnits) || requestedUnits < 1) return [];
    const rawTypes = Array.isArray(item.selectedItems)
      ? item.selectedItems
      : Array.isArray(item.types)
        ? item.types
        : [];
    const selectedItems = rawTypes.flatMap((rawType) => {
      if (!rawType || typeof rawType !== "object") return [];
      const type = rawType as Record<string, unknown>;
      const tipo = String(type.tipo || type.name || "").trim();
      const quantidade = Math.floor(Number(type.quantidade ?? type.quantity));
      return tipo && Number.isInteger(quantidade) && quantidade > 0 ? [{ tipo, quantidade }] : [];
    });
    return [{ productId, quantity: 1, requestedUnits, selectedItems }];
  });
}

async function maybeHandleDeterministicDraftPayment(job: InboundMessageJob, lead: BotLead, draft: WhatsappDraft | null) {
  if (!draft || ["HANDOFF", "ABANDONED", "COMPLETED", "AWAITING_PAYMENT"].includes(draft.status)) return false;
  const parsed = parseDraftPayment(job.text);
  if (!parsed.paymentMethod && !parsed.paymentPercentage) return false;
  const updated = await patchDraft(draft.id, {
    paymentMethod: parsed.paymentMethod || draft.paymentMethod,
    paymentPercentage: parsed.paymentPercentage || draft.paymentPercentage,
    stage: "COLLECTING",
    lastCustomerMessageAt: new Date(),
  }) || draft;
  logger.info({
    draftId: draft.id,
    paymentMethod: updated.paymentMethod,
    paymentPercentage: updated.paymentPercentage,
  }, "Draft payment captured deterministically");
  const methodLabel = parsed.paymentMethod === "PIX"
    ? "Pix"
    : parsed.paymentMethod === "CARTAO_DEBITO"
      ? "cartão de débito"
      : parsed.paymentMethod === "CARTAO_CREDITO"
        ? "cartão de crédito"
        : "pagamento";
  await sendAndTrack(job, lead, `Certo, registrei ${methodLabel} no seu pedido. ${getNextDraftQuestion(updated)}`);
  return true;
}

function canUseSalesAgent(lead: BotLead) {
  return !["awaiting_owner_approval", "awaiting_payment_validation", "human_handoff"].includes(lead.stage);
}

function isPricingQuestion(text: string) {
  return ["valor", "valores", "preco", "precos", "preço", "preços", "quanto", "custa"].some((term) =>
    text.includes(term)
  );
}

function isHoursQuestion(text: string) {
  return ["horario", "horarios", "hora", "horas", "abre", "fecha", "funciona", "domingo", "segunda"].some(
    (term) => text.includes(term)
  );
}

function isOrderingQuestion(text: string) {
  return ["encomenda", "encomendar", "pedido", "comprar", "como faz", "como pedir"].some((term) =>
    text.includes(term)
  );
}

function isPaymentQuestion(text: string) {
  return ["pix", "pagar", "pagamento", "sinal", "entrada", "50%", "metade", "total", "cartao", "cartão"].some(
    (term) => text.includes(term)
  );
}

function isDeliveryRequest(text: string) {
  return [
    "entrega",
    "entregar",
    "entregam",
    "entregaria",
    "delivery",
    "motoboy",
    "mototaxi",
    "mototaxi",
    "uber",
    "ifood",
    "levar",
    "leva",
  ].some((term) => text.includes(term));
}

function tokenizeSearchTerms(text: string) {
  const ignoredTerms = new Set([
    "qual",
    "quais",
    "valor",
    "valores",
    "preco",
    "precos",
    "preço",
    "preços",
    "quanto",
    "custa",
    "custam",
    "tem",
    "de",
    "da",
    "do",
    "dos",
    "das",
    "uma",
    "um",
    "uns",
    "umas",
    "para",
    "com",
  ]);

  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !ignoredTerms.has(term));
}

async function buildSupportReply(text: string) {
  const normalized = normalizeText(text);

  if (isHoursQuestion(normalized)) {
    return formatWhatsAppMessage([
      "🕒 *Horário da Vizinha*",
      [
        `Atendemos ${config.pickupHours}`,
        "⏰ A tolerância de atraso é de 15 minutos para ambas as partes.",
      ],
    ]);
  }

  if (isPaymentQuestion(normalized)) {
    return formatWhatsAppMessage([
      "💳 *Como funciona o pagamento*",
      [
        "Para confirmar a encomenda, é necessário pagar pelo menos *50%* do valor.",
        "Se preferir, também pode pagar o valor total.",
        "Assim que o pedido for aprovado, eu envio as orientações de pagamento aqui no WhatsApp.",
      ],
    ]);
  }

  if (isPricingQuestion(normalized)) {
    const products = await listActiveProducts();
    const searchTerms = tokenizeSearchTerms(normalized);
    const matches = products
      .map((product) => {
        const haystack = normalizeText(`${product.nome} ${product.descricao} ${product.categoria}`);
        const score = searchTerms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return { product, score };
      })
      .filter(({ score }) => (searchTerms.length > 0 ? score > 0 : true))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return Number(a.product.preco) - Number(b.product.preco);
      })
      .slice(0, 4)
      .map(({ product }) => product);

    if (matches.length > 0) {
      return formatWhatsAppMessage([
        "💸 *Valores que encontrei no cardápio*",
        formatWhatsAppList(
          matches.map((product) => `*${product.nome}* por *${formatProductPriceForCustomer(product)}*`),
          "-"
        ),
        `📲 Se quiser ver tudo certinho, aqui está o cardápio completo:\n${config.cardapioUrl}`,
      ]);
    }

    if (products.length > 0) {
      return formatWhatsAppMessage([
        "💸 *Sobre os valores*",
        "Posso te adiantar alguns itens do cardápio:",
        formatWhatsAppList(
          products.slice(0, 3).map((product) => `*${product.nome}* por *${formatProductPriceForCustomer(product)}*`),
          "-"
        ),
        `📲 Cardápio completo: ${config.cardapioUrl}`,
      ]);
    }
  }

  if (isOrderingQuestion(normalized)) {
    return buildSiteOrderInstructionsMessage(config.cardapioUrl);
  }

  return null;
}

async function maybeHandleSupportQuestion(job: InboundMessageJob, lead: BotLead) {
  const normalized = normalizeText(job.text);
  const reply = await buildSupportReply(job.text);

  if (!reply) {
    return false;
  }

  const nextLead = await updateLead(lead.id, {
    lastInboundText: job.text,
    stage: lead.stage === "new" ? "awaiting_intent" : lead.stage,
    intent: isPricingQuestion(normalized) ? "valores" : isPaymentQuestion(normalized) ? "pagamento" : "duvida",
  });

  await sendAndTrack(job, nextLead || lead, reply);
  return true;
}

async function maybeHandleDeliveryRequest(job: InboundMessageJob, lead: BotLead) {
  const normalized = normalizeText(job.text);

  if (!isDeliveryRequest(normalized)) {
    return false;
  }

  const nextLead = await updateLead(lead.id, {
    lastInboundText: job.text,
    stage: lead.stage === "new" ? "awaiting_intent" : lead.stage,
    intent: "entrega",
    observacoes: "Cliente perguntou sobre entrega; tabela de taxas e checkout enviados.",
  });

  await sendAndTrack(job, nextLead || lead, buildDeliveryMessage(config.cardapioUrl));
  return true;
}

async function sendAndTrack(job: InboundMessageJob, lead: BotLead | null, text: string) {
  const outboundText = appendOutsideHoursNotice(text);
  logger.info(
    {
      instanceId: job.instanceId,
      remoteJid: job.remoteJid,
      leadId: lead?.id || null,
      outboundPreview: outboundText.slice(0, 160),
    },
    "Attempting to send outbound message"
  );

  await instanceManager.sendText(job.instanceId, job.remoteJid, outboundText);

  if (outboundText.includes(config.cardapioUrl)) {
    const draft = await getOrCreateDraft(job.instanceId, job.remoteJid, job.phoneNumber);
    if (draft) await markSiteLinkSent(draft.id);
  }

  if (lead) {
    await updateLead(lead.id, { lastOutboundText: outboundText });
  }
}

async function sendTextToNumber(
  instanceId: string,
  number: string,
  text: string,
  options?: { appendOutsideHoursNotice?: boolean }
) {
  const outboundText = options?.appendOutsideHoursNotice ? appendOutsideHoursNotice(text) : text;
  await instanceManager.sendText(instanceId, normalizeOutboundNumber(number), outboundText);
}

async function sendIntro(job: InboundMessageJob, lead: BotLead | null) {
  await sendAndTrack(job, lead, buildWelcomeMessage(config.cardapioUrl));
}

async function sendCatalogOverview(job: InboundMessageJob, lead: BotLead | null) {
  const products = await listActiveProducts();
  const promoHighlights = products
    .filter((item) => item.emPromocao)
    .slice(0, 3)
    .map((item) => ({ nome: item.nome, preco: formatProductPriceForCustomer(item) }));

  await sendAndTrack(job, lead, buildCatalogOverviewMessage(config.cardapioUrl, promoHighlights));
}

async function notifyCustomerOrderRejected(instanceId: string, order: BotOrder) {
  await sendTextToNumber(
    instanceId,
    order.customerRemoteJid,
    buildCustomerOrderRejectedMessage(order.code, config.cardapioUrl, order.ownerReason),
    { appendOutsideHoursNotice: true }
  );
}

async function notifyCustomerAwaitingPayment(instanceId: string, order: BotOrder) {
  await sendTextToNumber(
    instanceId,
    order.customerRemoteJid,
    buildCustomerAwaitingPaymentMessage(order.code, config.pixKey),
    { appendOutsideHoursNotice: true }
  );
}

async function notifyCustomerOrderConfirmed(instanceId: string, order: BotOrder) {
  await sendTextToNumber(
    instanceId,
    order.customerRemoteJid,
    buildCustomerOrderConfirmedMessage(order.code, order.horarioEntrega, order.paymentStatus),
    { appendOutsideHoursNotice: true }
  );
}

function parseOwnerCommand(text: string) {
  const approveMatch = text.match(/^(aprovar|aprovado|aceitar|aceito)\s+([a-z0-9]{6})$/i);
  if (approveMatch) {
    return { type: "APPROVE" as const, code: approveMatch[2].toUpperCase() };
  }

  const paidMatch = text.match(/^pago\s+(metade|total)\s+([a-z0-9]{6})$/i);
  if (paidMatch) {
    return {
      type: "PAID" as const,
      payment:
        paidMatch[1].toLowerCase() === "total"
          ? ("FULL" as const)
          : ("HALF" as const),
      code: paidMatch[2].toUpperCase(),
    };
  }

  const rejectMatch = text.match(/^(recusar|reprovar|negar)\s+([a-z0-9]{6})(?:\s+(.+))?$/i);
  if (rejectMatch) {
    return {
      type: "REJECT" as const,
      code: rejectMatch[2].toUpperCase(),
      reason: rejectMatch[3]?.trim() || "",
    };
  }

  return null;
}

async function handleOwnerMessage(job: InboundMessageJob) {
  const command = parseOwnerCommand(job.text.trim());

  if (!command) {
    await sendTextToNumber(job.instanceId, job.remoteJid, buildOwnerCommandHelpMessage());
    return true;
  }

  const order = await findBotOrderByCode(job.instanceId, command.code);

  if (!order) {
    await sendTextToNumber(job.instanceId, job.remoteJid, buildOwnerOrderNotFoundMessage(command.code));
    return true;
  }

  if (command.type === "REJECT" && !command.reason) {
    await sendTextToNumber(job.instanceId, job.remoteJid, buildOwnerRejectReasonMessage(command.code));
    return true;
  }

  if (command.type === "APPROVE") {
    if (order.status === "AWAITING_PAYMENT" || order.status === "PAYMENT_REPORTED" || order.status === "CONFIRMED") {
      await sendTextToNumber(job.instanceId, job.remoteJid, buildOwnerApprovedAckMessage(command.code));
      return true;
    }

    const updated = await updateBotOrder(order.id, {
      status: "AWAITING_PAYMENT",
      ownerReason: null,
    });

    await notifyCustomerAwaitingPayment(job.instanceId, updated || order);
    if (order.leadId) {
      await updateLead(order.leadId, {
        stage: "awaiting_payment_validation",
        status: "qualified",
      });
    }
    await sendTextToNumber(job.instanceId, job.remoteJid, buildOwnerApprovedAckMessage(command.code));
    return true;
  }

  if (command.type === "PAID") {
    if (order.status === "CONFIRMED" && order.paymentStatus === command.payment) {
      await sendTextToNumber(job.instanceId, job.remoteJid, buildOwnerPaidAckMessage(command.code));
      return true;
    }

    const updated = await updateBotOrder(order.id, {
      status: "CONFIRMED",
      paymentStatus: command.payment,
      ownerReason: null,
    });

    await notifyCustomerOrderConfirmed(job.instanceId, updated || order);
    if (order.leadId) {
      await updateLead(order.leadId, {
        stage: "confirmed",
        status: "closed",
      });
    }
    await sendTextToNumber(job.instanceId, job.remoteJid, buildOwnerPaidAckMessage(command.code));
    return true;
  }

  const updated = await updateBotOrder(order.id, {
    status: "REJECTED",
    ownerReason: command.reason,
  });

  await notifyCustomerOrderRejected(job.instanceId, updated || order);
  await sendTextToNumber(job.instanceId, job.remoteJid, buildOwnerRejectedAckMessage(command.code));
  return true;
}

function getCustomerLabel(order: BotOrder) {
  return order.customerName || order.customerPhoneNumber || order.customerRemoteJid;
}

function getLeadLabel(lead: BotLead) {
  return lead.nome || lead.pushName || lead.phoneNumber || lead.remoteJid;
}

async function transferToHumanAttendant(job: InboundMessageJob, lead: BotLead, reply?: string) {
  const draft = await getOrCreateDraft(job.instanceId, job.remoteJid, job.phoneNumber);
  if (draft) await patchDraft(draft.id, { stage: "HANDOFF", status: "HANDOFF", whatsappOfferDueAt: null });
  const nextLead = await updateLead(lead.id, {
    stage: "human_handoff",
    status: "handoff",
    lastInboundText: job.text,
  });

  const handoffLead = nextLead || lead;
  await sendAndTrack(job, handoffLead, reply || buildHumanHandoffMessage());
  await sendTextToNumber(
    job.instanceId,
    config.ownerApprovalNumber,
    buildOwnerHandoffAlertMessage(getLeadLabel(handoffLead), job.text, handoffLead.lastOutboundText)
  );
  return true;
}

async function handleExistingOpenOrder(job: InboundMessageJob, lead: BotLead) {
  const text = normalizeText(job.text);
  const openOrder = await findLatestOpenOrderByCustomer(job.instanceId, job.remoteJid);

  if (!openOrder) {
    return false;
  }

  if (openOrder.status === "PENDING_OWNER_APPROVAL") {
    await updateLead(lead.id, {
      stage: "awaiting_owner_approval",
      status: "pending_owner_approval",
      lastInboundText: job.text,
    });

    await sendAndTrack(job, lead, buildPendingApprovalMessage(openOrder.code));
    return true;
  }

  if (openOrder.status === "AWAITING_PAYMENT" || openOrder.status === "PAYMENT_REPORTED") {
    if (indicatesPayment(text)) {
      const updated = await updateBotOrder(openOrder.id, { status: "PAYMENT_REPORTED" });
      await sendTextToNumber(
        job.instanceId,
        config.ownerApprovalNumber,
        buildOwnerPaymentReportedMessage(openOrder.code, getCustomerLabel(openOrder))
      );
      await updateLead(lead.id, {
        stage: "awaiting_payment_validation",
        status: "awaiting_payment_validation",
        lastInboundText: job.text,
      });
      await sendAndTrack(job, lead, buildPaymentReportedAckMessage((updated || openOrder).code));
      return true;
    }

    await sendAndTrack(job, lead, buildAwaitingPaymentReminderMessage(openOrder.code, config.pixKey));
    return true;
  }

  return false;
}

async function maybeHandleSalesAgent(job: InboundMessageJob, lead: BotLead, draft: WhatsappDraft | null) {
  if (!config.geminiApiKey || !canUseSalesAgent(lead)) {
    return false;
  }

  const agentResult = await runSalesAgent(job, lead, draft);

  if (!agentResult?.reply) {
    return false;
  }

  if (agentResult.status === "handoff") {
    if (draft) await patchDraft(draft.id, { status: "HANDOFF", stage: "HANDOFF", whatsappOfferDueAt: null });
    return transferToHumanAttendant(job, lead, agentResult.reply);
  }

  let currentDraft = draft;
  if (draft) {
    const extracted = agentResult.extracted || {};
    if (extracted.items !== undefined) extracted.items = normalizeDraftItems(extracted.items);
    if (extracted.paymentMethod !== undefined) {
      extracted.paymentMethod = normalizeDraftPaymentMethod(extracted.paymentMethod);
    }
    const allowed = ["customerName", "customerEmail", "fulfillmentType", "scheduledAt", "deliveryStreet", "deliveryNumber", "deliveryNeighborhood", "deliveryReference", "paymentMethod", "paymentPercentage", "items"];
    const patch = Object.fromEntries(allowed.filter((key) => extracted[key] !== undefined).map((key) => [key, extracted[key]]));
    patch.lastCustomerMessageAt = new Date();
    if (agentResult.action === "SEND_SITE") await markSiteLinkSent(draft.id);
    else if (agentResult.action === "START_WHATSAPP_ORDER") Object.assign(patch, { stage: "COLLECTING", status: "ACTIVE", whatsappOfferDueAt: null });
    else if (agentResult.action === "CANCEL_DRAFT") Object.assign(patch, { stage: "CANCELLED", status: "ABANDONED", whatsappOfferDueAt: null });
    else if (agentResult.action === "SHOW_SUMMARY") patch.stage = "AWAITING_CONFIRMATION";
    currentDraft = await patchDraft(draft.id, patch) || draft;
    logger.info({
      draftId: draft.id,
      action: agentResult.action,
      extractedFields: Object.keys(patch),
      itemCount: Array.isArray(currentDraft.items) ? currentDraft.items.length : 0,
      paymentMethod: currentDraft.paymentMethod,
    }, "Structured sales action persisted");
    if (agentResult.action === "CONFIRM_ORDER") {
      const response = await fetch(`${config.appUrl}/api/internal/whatsapp-orders`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ ...currentDraft, draftId: currentDraft.id }),
      });
      const data = await response.json() as { error?: string; order?: { id: string; code?: string; chargedAmount: string }; pixCopyPaste?: string; checkoutUrl?: string };
      if (!response.ok || !data.order) {
        await sendAndTrack(job, lead, `Não consegui confirmar ainda: ${data.error || "revise os dados do pedido"}`);
        return true;
      }
      const code = data.order.code || data.order.id.slice(0, 8).toUpperCase();
      const paymentText = data.pixCopyPaste
        ? `Valor a pagar agora: R$ ${Number(data.order.chargedAmount).toFixed(2).replace(".", ",")}\n\nPix copia e cola:\n${data.pixCopyPaste}`
        : `Pague com cartão no checkout seguro:\n${data.checkoutUrl}`;
      await sendAndTrack(job, lead, `Seu pedido #${code} foi criado 😊\n${paymentText}\n\nAssim que o pagamento for confirmado, eu aviso por aqui.`);
      return true;
    }
  }

  const nextLead = await updateLead(lead.id, {
    lastInboundText: job.text,
    stage: agentResult.stage || lead.stage,
    status: agentResult.status || lead.status,
    intent: agentResult.intent ?? lead.intent,
    nome: agentResult.nome ?? lead.nome,
    eventoDetalhes: agentResult.eventoDetalhes ?? lead.eventoDetalhes,
    horarioEntrega: agentResult.horarioEntrega ?? lead.horarioEntrega,
    menuCategoria: agentResult.menuCategoria ?? lead.menuCategoria,
    bairroRetirada: agentResult.bairroRetirada ?? lead.bairroRetirada,
    observacoes: agentResult.observacoes ?? lead.observacoes,
  });

  const activeOrderInProgress = currentDraft?.status === "ACTIVE"
    && Array.isArray(currentDraft.items) && currentDraft.items.length > 0;
  const normalizedReply = normalizeText(agentResult.reply);
  const genericFlowBreaker = agentResult.reply.includes(config.cardapioUrl)
    || normalizedReply.includes("como funciona o pagamento")
    || normalizedReply.includes("como fazer sua encomenda");
  const reply = activeOrderInProgress && genericFlowBreaker
    ? `Vamos continuar seu pedido por aqui. ${getNextDraftQuestion(currentDraft!)}`
    : agentResult.reply;
  await sendAndTrack(job, nextLead || lead, reply);
  return true;
}

async function handleLeadFunnel(job: InboundMessageJob, lead: BotLead) {
  const text = normalizeText(job.text);
  const openOrder = await findLatestOpenOrderByCustomer(job.instanceId, job.remoteJid);

  if (openOrder?.status === "AWAITING_PAYMENT" || openOrder?.status === "PAYMENT_REPORTED") {
    if (indicatesPayment(text)) {
      const updated = await updateBotOrder(openOrder.id, { status: "PAYMENT_REPORTED" });
      await sendTextToNumber(
        job.instanceId,
        config.ownerApprovalNumber,
        buildOwnerPaymentReportedMessage(openOrder.code, getCustomerLabel(openOrder))
      );
      await updateLead(lead.id, {
        stage: "awaiting_payment_validation",
        status: "awaiting_payment_validation",
        lastInboundText: job.text,
      });
      await sendAndTrack(job, lead, buildPaymentReportedAckMessage((updated || openOrder).code));
      return true;
    }

    await sendAndTrack(job, lead, buildAwaitingPaymentReminderMessage(openOrder.code, config.pixKey));
    return true;
  }

  if (lead.stage === "new") {
    if (await maybeHandleSupportQuestion(job, lead)) {
      return true;
    }

    await updateLead(lead.id, {
      stage: "awaiting_intent",
      lastInboundText: job.text,
      pushName: job.pushName || lead.pushName,
    });
    await sendIntro(job, lead);
    return true;
  }

  if (lead.stage === "awaiting_intent") {
    if (text === "1") {
      await updateLead(lead.id, {
        stage: "site_order_guided",
        intent: "encomenda",
        status: "qualified",
        lastInboundText: job.text,
      });
      await sendAndTrack(job, lead, buildSiteOrderInstructionsMessage(config.cardapioUrl));
      return true;
    }

    if (text === "2" || isMenuRequest(text)) {
      await sendCatalogOverview(job, lead);
      await updateLead(lead.id, { lastInboundText: job.text });
      return true;
    }

    if (text === "3") {
      await sendAndTrack(job, lead, buildSupportPromptMessage());
      await updateLead(lead.id, { lastInboundText: job.text });
      return true;
    }

    if (await maybeHandleSupportQuestion(job, lead)) {
      return true;
    }

    await sendIntro(job, lead);
    return true;
  }

  if (
    lead.stage === "site_order_guided" ||
    lead.stage === "awaiting_event_details" ||
    lead.stage === "awaiting_name" ||
    lead.stage === "awaiting_delivery_time" ||
    lead.stage === "awaiting_notes"
  ) {
    if (await maybeHandleSupportQuestion(job, lead)) {
      return true;
    }

    await updateLead(lead.id, {
      stage: "site_order_guided",
      lastInboundText: job.text,
    });
    await sendAndTrack(job, lead, buildSiteOrderInstructionsMessage(config.cardapioUrl));
    return true;
  }

  if (lead.stage === "awaiting_owner_approval" || lead.stage === "awaiting_payment_validation") {
    await updateLead(lead.id, { lastInboundText: job.text });
    await sendAndTrack(job, lead, buildAwaitingAnalysisMessage());
    return true;
  }

  if (lead.stage === "human_handoff") {
    await updateLead(lead.id, { lastInboundText: job.text });
    return true;
  }

  if (lead.stage === "confirmed") {
    await updateLead(lead.id, { lastInboundText: job.text });
    await sendAndTrack(job, lead, buildConfirmedFollowUpMessage(config.cardapioUrl));
    return true;
  }

  return false;
}

export async function processInboundMessage(job: InboundMessageJob) {
  const normalized = normalizeText(job.text);
  const hasMeaningfulText = hasMeaningfulInboundText(job);
  logger.info(
    {
      instanceId: job.instanceId,
      remoteJid: job.remoteJid,
      normalizedText: normalized,
      mediaKind: job.mediaKind,
    },
    "processInboundMessage started"
  );

  if (isOwnerChat(job.remoteJid)) {
    await handleOwnerMessage(job);
    return;
  }

  const lead = await getOrCreateLead({
    instanceId: job.instanceId,
    remoteJid: job.remoteJid,
    pushName: job.pushName,
  });
  const draft = await getOrCreateDraft(job.instanceId, job.remoteJid, job.phoneNumber);
  if (draft) await patchDraft(draft.id, { lastCustomerMessageAt: new Date() });

  if (!lead) {
    if (job.mediaKind && !hasMeaningfulText) {
      await instanceManager.sendText(job.instanceId, job.remoteJid, buildMediaRetryMessage(job.mediaKind));
      return;
    }

    await sendIntro(job, null);
    return;
  }

  if (job.mediaKind && !hasMeaningfulText) {
    await sendAndTrack(job, lead, buildMediaRetryMessage(job.mediaKind));
    return;
  }

  if (await maybeHandleDeterministicDraftPayment(job, lead, draft)) {
    return;
  }

  if (await handleExistingOpenOrder(job, lead)) {
    return;
  }

  // Durante uma conversa de venda, o agente estruturado precisa extrair junto
  // modalidade, endereco e pagamento. A resposta generica de entrega e apenas fallback.
  if (await maybeHandleSalesAgent(job, lead, draft)) {
    return;
  }

  if (await maybeHandleDeliveryRequest(job, lead)) {
    return;
  }

  const hasActiveDraftItems = draft?.status === "ACTIVE" && Array.isArray(draft.items) && draft.items.length > 0;
  const handledByFunnel = hasActiveDraftItems ? false : await handleLeadFunnel(job, lead);
  if (handledByFunnel) {
    return;
  }

  if (config.geminiApiKey) {
    const agentResult = await runSalesAgent(job, lead, draft);

    if (agentResult?.reply) {
      if (agentResult.status === "handoff") {
        await transferToHumanAttendant(job, lead, agentResult.reply);
        return;
      }

      await sendAndTrack(job, lead, agentResult.reply);
      await updateLead(lead.id, {
        lastInboundText: job.text,
        stage: agentResult.stage || lead.stage,
        status: agentResult.status || lead.status,
        intent: agentResult.intent ?? lead.intent,
        nome: agentResult.nome ?? lead.nome,
        eventoDetalhes: agentResult.eventoDetalhes ?? lead.eventoDetalhes,
        horarioEntrega: agentResult.horarioEntrega ?? lead.horarioEntrega,
        menuCategoria: agentResult.menuCategoria ?? lead.menuCategoria,
        bairroRetirada: agentResult.bairroRetirada ?? lead.bairroRetirada,
        observacoes: agentResult.observacoes ?? lead.observacoes,
      });
      return;
    }
  }

  const matchedFlow = await findMatchingFlow(job.instanceId, job.text);
  if (matchedFlow) {
    await sendAndTrack(job, lead, matchedFlow.resposta);
    await updateLead(lead.id, { lastInboundText: job.text });
    return;
  }

  if (isMenuRequest(normalized)) {
    await updateLead(lead.id, { lastInboundText: job.text });
    await sendCatalogOverview(job, lead);
    return;
  }

  if (await maybeHandleSupportQuestion(job, lead)) {
    return;
  }

  if (isGreeting(normalized)) {
    await updateLead(lead.id, {
      stage: "awaiting_intent",
      lastInboundText: job.text,
    });
    await sendIntro(job, lead);
    return;
  }

  if (indicatesPayment(normalized)) {
    await sendAndTrack(job, lead, buildPaymentProofGuidanceMessage(config.cardapioUrl));
    await updateLead(lead.id, { lastInboundText: job.text });
    return;
  }

  await sendAndTrack(job, lead, buildFallbackHelpMessage(config.cardapioUrl));
  await updateLead(lead.id, { lastInboundText: job.text });
}
