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
import { listActiveProducts } from "./product-repository.js";
import type { InboundMessageJob } from "./types.js";
import {
  buildAwaitingAnalysisMessage,
  buildAwaitingPaymentReminderMessage,
  buildCatalogOverviewMessage,
  buildConfirmedFollowUpMessage,
  buildCustomerAwaitingPaymentMessage,
  buildCustomerOrderConfirmedMessage,
  buildCustomerOrderRejectedMessage,
  buildFallbackHelpMessage,
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
} from "./whatsapp-format.js";

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

function canUseSalesAgent(lead: BotLead) {
  return ["new", "awaiting_intent", "site_order_guided"].includes(lead.stage);
}

async function sendAndTrack(job: InboundMessageJob, lead: BotLead | null, text: string) {
  logger.info(
    {
      instanceId: job.instanceId,
      remoteJid: job.remoteJid,
      leadId: lead?.id || null,
      outboundPreview: text.slice(0, 160),
    },
    "Attempting to send outbound message"
  );

  await instanceManager.sendText(job.instanceId, job.remoteJid, text);

  if (lead) {
    await updateLead(lead.id, { lastOutboundText: text });
  }
}

async function sendTextToNumber(instanceId: string, number: string, text: string) {
  await instanceManager.sendText(instanceId, normalizeOutboundNumber(number), text);
}

async function sendIntro(job: InboundMessageJob, lead: BotLead | null) {
  await sendAndTrack(job, lead, buildWelcomeMessage(config.cardapioUrl));
}

async function sendCatalogOverview(job: InboundMessageJob, lead: BotLead | null) {
  const products = await listActiveProducts();
  const promoHighlights = products
    .filter((item) => item.emPromocao)
    .slice(0, 3)
    .map((item) => ({ nome: item.nome, preco: item.preco }));

  await sendAndTrack(job, lead, buildCatalogOverviewMessage(config.cardapioUrl, promoHighlights));
}

async function notifyCustomerOrderRejected(instanceId: string, order: BotOrder) {
  await sendTextToNumber(
    instanceId,
    order.customerRemoteJid,
    buildCustomerOrderRejectedMessage(order.code, config.cardapioUrl, order.ownerReason)
  );
}

async function notifyCustomerAwaitingPayment(instanceId: string, order: BotOrder) {
  await sendTextToNumber(
    instanceId,
    order.customerRemoteJid,
    buildCustomerAwaitingPaymentMessage(order.code, config.pixKey)
  );
}

async function notifyCustomerOrderConfirmed(instanceId: string, order: BotOrder) {
  await sendTextToNumber(
    instanceId,
    order.customerRemoteJid,
    buildCustomerOrderConfirmedMessage(order.code, order.horarioEntrega, order.paymentStatus)
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
    const updated = await updateBotOrder(order.id, {
      status: "AWAITING_PAYMENT",
      ownerReason: null,
    });

    await notifyCustomerAwaitingPayment(job.instanceId, updated || order);
    await sendTextToNumber(job.instanceId, job.remoteJid, buildOwnerApprovedAckMessage(command.code));
    return true;
  }

  if (command.type === "PAID") {
    const updated = await updateBotOrder(order.id, {
      status: "CONFIRMED",
      paymentStatus: command.payment,
      ownerReason: null,
    });

    await notifyCustomerOrderConfirmed(job.instanceId, updated || order);
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

async function maybeHandleSalesAgent(job: InboundMessageJob, lead: BotLead) {
  if (!config.geminiApiKey || !canUseSalesAgent(lead)) {
    return false;
  }

  const agentResult = await runSalesAgent(job, lead);

  if (!agentResult?.reply) {
    return false;
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

  await sendAndTrack(job, nextLead || lead, agentResult.reply);
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

  if (lead.stage === "confirmed") {
    await updateLead(lead.id, { lastInboundText: job.text });
    await sendAndTrack(job, lead, buildConfirmedFollowUpMessage(config.cardapioUrl));
    return true;
  }

  return false;
}

export async function processInboundMessage(job: InboundMessageJob) {
  const normalized = normalizeText(job.text);
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

  if (!lead) {
    await sendIntro(job, null);
    return;
  }

  if (await handleExistingOpenOrder(job, lead)) {
    return;
  }

  if (await maybeHandleSalesAgent(job, lead)) {
    return;
  }

  const handledByFunnel = await handleLeadFunnel(job, lead);
  if (handledByFunnel) {
    return;
  }

  if (config.geminiApiKey) {
    const agentResult = await runSalesAgent(job, lead);

    if (agentResult?.reply) {
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
