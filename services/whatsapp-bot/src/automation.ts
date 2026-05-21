import {
  createBotOrder,
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

function isOwnerChat(remoteJid: string) {
  return normalizePhone(remoteJid) === normalizePhone(config.ownerApprovalNumber);
}

function isGreeting(text: string) {
  return ["oi", "ola", "olá", "menu", "cardapio", "cardapio por favor"].includes(text);
}

function parseMenuCategory(text: string) {
  if (text === "1" || text.includes("cento")) {
    return "CENTO" as const;
  }

  if (text === "2" || text.includes("lanchonete") || text.includes("lanche")) {
    return "LANCHONETE" as const;
  }

  return null;
}

function indicatesPayment(text: string) {
  return ["paguei", "pagamento", "pix", "comprovante", "pago"].some((term) =>
    text.includes(term)
  );
}

function formatMenuCategory(category: "CENTO" | "LANCHONETE") {
  return category === "CENTO" ? "Cardápio de cento" : "Cardápio da lanchonete";
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
  await instanceManager.sendText(instanceId, number, text);
}

async function sendIntro(job: InboundMessageJob, lead: BotLead | null) {
  await sendAndTrack(
    job,
    lead,
    [
      "*Oi! Seja bem-vinda(o) à Vizinha Salgateria.*",
      "",
      `*Bot de atendimento:* ${config.botPhoneNumber}`,
      `*Cardápio:* ${config.cardapioUrl}`,
      "",
      "Me responda com uma opção:",
      "*1* - Quero fazer uma encomenda",
      "*2* - Quero ver os cardápios",
      "*3* - Quero saber endereço e como funciona",
    ].join("\n")
  );
}

async function sendCatalogOverview(job: InboundMessageJob, lead: BotLead | null) {
  const products = await listActiveProducts();
  const cento = products.filter((product) => product.categoria === "CENTO");
  const lanchonete = products.filter((product) => product.categoria === "LANCHONETE");

  const formatList = (items: typeof products) =>
    items.length === 0
      ? "Sem itens publicados no momento."
      : items
          .slice(0, 6)
          .map((item) => `- ${item.nome} | R$ ${item.preco}`)
          .join("\n");

  await sendAndTrack(
    job,
    lead,
    [
      `*Cardápio completo:* ${config.cardapioUrl}`,
      "",
      "*Cento*",
      formatList(cento),
      "",
      "*Lanchonete*",
      formatList(lanchonete),
      "",
      "Se quiser encomendar, me diga:",
      "*1* - Cardápio de cento",
      "*2* - Cardápio da lanchonete",
    ].join("\n")
  );
}

function buildCustomerSummary(lead: BotLead) {
  return [
    `*Tipo de cardápio:* ${formatMenuCategory(lead.menuCategoria || "CENTO")}`,
    `*Nome:* ${lead.nome || "Não informado"}`,
    `*Pedido:* ${lead.eventoDetalhes || "Não informado"}`,
    `*Horário pedido pelo cliente:* ${lead.horarioEntrega || "Não informado"}`,
    `*Observações:* ${lead.observacoes || "Nenhuma"}`,
    "",
    "*Regras*",
    "- Confirmação só com aceite da Vizinha e pagamento total ou metade.",
    "- Tolerância de atraso de 15 minutos para ambas as partes.",
  ].join("\n");
}

function buildOwnerApprovalMessage(order: BotOrder) {
  return [
    `*Nova encomenda pendente* #${order.code}`,
    "",
    order.summary,
    "",
    "Responda assim para seguir:",
    `- APROVAR ${order.code}`,
    `- PAGO METADE ${order.code}`,
    `- PAGO TOTAL ${order.code}`,
    `- RECUSAR ${order.code} motivo`,
  ].join("\n");
}

async function notifyCustomerOrderRejected(instanceId: string, order: BotOrder) {
  await sendTextToNumber(
    instanceId,
    order.customerRemoteJid,
    [
      `Seu pedido #${order.code} não foi aceito pela Vizinha.`,
      order.ownerReason ? `Motivo: ${order.ownerReason}` : "",
      "",
      "Se quiser, posso te ajudar a montar outro pedido.",
    ]
      .filter(Boolean)
      .join("\n")
  );
}

async function notifyCustomerAwaitingPayment(instanceId: string, order: BotOrder) {
  await sendTextToNumber(
    instanceId,
    order.customerRemoteJid,
    [
      `Sua encomenda #${order.code} foi aceita pela Vizinha.`,
      "",
      "Para confirmar de vez, falta o pagamento de tudo ou da metade.",
      "Quando pagar, me avise por aqui para eu pedir a validação.",
      "A tolerância de atraso é de 15 minutos para ambas as partes.",
    ].join("\n")
  );
}

async function notifyCustomerOrderConfirmed(instanceId: string, order: BotOrder) {
  const paymentText = order.paymentStatus === "FULL" ? "pagamento total" : "pagamento de metade";
  await sendTextToNumber(
    instanceId,
    order.customerRemoteJid,
    [
      `Pedido #${order.code} confirmado com ${paymentText}.`,
      `Horário combinado pelo cliente: ${order.horarioEntrega}.`,
      "A tolerância de atraso é de 15 minutos para ambas as partes.",
    ].join("\n")
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
    await sendTextToNumber(
      job.instanceId,
      job.remoteJid,
      [
        "Não entendi o comando.",
        "Use:",
        "- APROVAR CODIGO",
        "- PAGO METADE CODIGO",
        "- PAGO TOTAL CODIGO",
        "- RECUSAR CODIGO motivo",
      ].join("\n")
    );
    return true;
  }

  const order = await findBotOrderByCode(job.instanceId, command.code);

  if (!order) {
    await sendTextToNumber(
      job.instanceId,
      job.remoteJid,
      `Não encontrei a encomenda #${command.code}.`
    );
    return true;
  }

  if (command.type === "REJECT" && !command.reason) {
    await sendTextToNumber(
      job.instanceId,
      job.remoteJid,
      `Me diga o motivo da recusa no formato: RECUSAR ${command.code} motivo`
    );
    return true;
  }

  if (command.type === "APPROVE") {
    const updated = await updateBotOrder(order.id, {
      status: "AWAITING_PAYMENT",
      ownerReason: null,
    });

    await notifyCustomerAwaitingPayment(job.instanceId, updated || order);
    await sendTextToNumber(
      job.instanceId,
      job.remoteJid,
      `Encomenda #${command.code} aceita. O cliente foi avisado para seguir com o pagamento.`
    );
    return true;
  }

  if (command.type === "PAID") {
    const updated = await updateBotOrder(order.id, {
      status: "CONFIRMED",
      paymentStatus: command.payment,
      ownerReason: null,
    });

    await notifyCustomerOrderConfirmed(job.instanceId, updated || order);
    await sendTextToNumber(
      job.instanceId,
      job.remoteJid,
      `Encomenda #${command.code} confirmada para o cliente.`
    );
    return true;
  }

  const updated = await updateBotOrder(order.id, {
    status: "REJECTED",
    ownerReason: command.reason,
  });

  await notifyCustomerOrderRejected(job.instanceId, updated || order);
  await sendTextToNumber(
    job.instanceId,
    job.remoteJid,
    `Recusa da encomenda #${command.code} registrada e enviada ao cliente.`
  );
  return true;
}

async function createOrderAndRequestOwnerApproval(job: InboundMessageJob, lead: BotLead) {
  const summary = buildCustomerSummary(lead);
  const order = await createBotOrder({
    instanceId: job.instanceId,
    leadId: lead.id,
    customerRemoteJid: job.remoteJid,
    customerPhoneNumber: lead.phoneNumber,
    customerName: lead.nome,
    menuCategoria: lead.menuCategoria || "CENTO",
    eventoDetalhes: lead.eventoDetalhes || "",
    horarioEntrega: lead.horarioEntrega || "",
    observacoes: lead.observacoes,
    summary,
  });

  if (!order) {
    await sendAndTrack(
      job,
      lead,
      "Tive um problema para registrar seu pedido agora. Pode me chamar novamente em instantes?"
    );
    return true;
  }

  await sendTextToNumber(
    job.instanceId,
    config.ownerApprovalNumber,
    buildOwnerApprovalMessage(order)
  );

  await updateLead(lead.id, {
    stage: "awaiting_owner_approval",
    status: "pending_owner_approval",
    lastInboundText: job.text,
  });

  await sendAndTrack(
    job,
    lead,
    [
      `Seu resumo foi enviado para análise da Vizinha com o código #${order.code}.`,
      "Assim que ela aceitar ou recusar, eu te aviso por aqui.",
      "A confirmação final só acontece depois do aceite e do pagamento de tudo ou da metade.",
    ].join("\n")
  );

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
        [
          `Cliente avisou sobre o pagamento da encomenda #${openOrder.code}.`,
          `Cliente: ${openOrder.customerName || openOrder.customerPhoneNumber || openOrder.customerRemoteJid}`,
          "Se estiver tudo certo, responda:",
          `- PAGO METADE ${openOrder.code}`,
          `- PAGO TOTAL ${openOrder.code}`,
        ].join("\n")
      );
      await updateLead(lead.id, {
        stage: "awaiting_payment_validation",
        status: "awaiting_payment_validation",
        lastInboundText: job.text,
      });
      await sendAndTrack(
        job,
        lead,
        `Perfeito. Avisei a Vizinha sobre o pagamento da encomenda #${(updated || openOrder).code}. Assim que ela validar, eu confirmo por aqui.`
      );
      return true;
    }

    await sendAndTrack(
      job,
      lead,
      `A encomenda #${openOrder.code} já foi aceita e está aguardando pagamento. Quando pagar tudo ou a metade, me avise por aqui.`
    );
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
        stage: "awaiting_menu_category",
        intent: "encomenda",
        lastInboundText: job.text,
      });
      await sendAndTrack(
        job,
        lead,
        "Qual cardápio você quer pedir?\n*1* - Cardápio de cento\n*2* - Cardápio da lanchonete"
      );
      return true;
    }

    if (text === "2") {
      await sendCatalogOverview(job, lead);
      await updateLead(lead.id, { lastInboundText: job.text });
      return true;
    }

    if (text === "3") {
      await sendAndTrack(
        job,
        lead,
        [
          `*Cardápio:* ${config.cardapioUrl}`,
          "",
          "O horário da entrega deve ser informado por você durante o pedido.",
          "A confirmação depende do aceite da Vizinha e depois do pagamento total ou da metade.",
          "A tolerância de atraso é de 15 minutos para ambas as partes.",
        ].join("\n")
      );
      await updateLead(lead.id, { lastInboundText: job.text });
      return true;
    }

    const category = parseMenuCategory(text);
    if (category) {
      await updateLead(lead.id, {
        stage: "awaiting_event_details",
        intent: "encomenda",
        menuCategoria: category,
        lastInboundText: job.text,
      });
      await sendAndTrack(
        job,
        lead,
        `Perfeito. Me diga os detalhes do seu pedido de ${formatMenuCategory(category).toLowerCase()}: quantidade, sabores e para qual dia.`
      );
      return true;
    }

    await sendIntro(job, lead);
    return true;
  }

  if (lead.stage === "awaiting_menu_category") {
    const category = parseMenuCategory(text);

    if (!category) {
      await sendAndTrack(
        job,
        lead,
        "Me responda com:\n*1* - Cardápio de cento\n*2* - Cardápio da lanchonete"
      );
      return true;
    }

    await updateLead(lead.id, {
      stage: "awaiting_event_details",
      menuCategoria: category,
      lastInboundText: job.text,
    });
    await sendAndTrack(
      job,
      lead,
      `Perfeito. Me diga os detalhes do seu pedido de ${formatMenuCategory(category).toLowerCase()}: quantidade, sabores e para qual dia.`
    );
    return true;
  }

  if (lead.stage === "awaiting_event_details") {
    await updateLead(lead.id, {
      stage: "awaiting_name",
      eventoDetalhes: job.text,
      lastInboundText: job.text,
    });
    await sendAndTrack(job, lead, "Certo. Me fala seu nome, por favor?");
    return true;
  }

  if (lead.stage === "awaiting_name") {
    await updateLead(lead.id, {
      stage: "awaiting_delivery_time",
      nome: job.text,
      lastInboundText: job.text,
    });
    await sendAndTrack(
      job,
      lead,
      "Qual horário de entrega você quer? Pode me dizer do seu jeito."
    );
    return true;
  }

  if (lead.stage === "awaiting_delivery_time") {
    await updateLead(lead.id, {
      stage: "awaiting_notes",
      horarioEntrega: job.text,
      lastInboundText: job.text,
    });
    await sendAndTrack(
      job,
      lead,
      "Tem mais alguma observação importante? Se não tiver, pode responder *não*."
    );
    return true;
  }

  if (lead.stage === "awaiting_notes") {
    const notes = text === "nao" || text === "não" ? "Sem observações adicionais" : job.text;
    const updatedLead = await updateLead(lead.id, {
      observacoes: notes,
      lastInboundText: job.text,
    });

    return createOrderAndRequestOwnerApproval(job, updatedLead || lead);
  }

  if (lead.stage === "awaiting_owner_approval" || lead.stage === "awaiting_payment_validation") {
    await updateLead(lead.id, { lastInboundText: job.text });
    await sendAndTrack(
      job,
      lead,
      "Seu pedido já está em análise. Assim que eu tiver a resposta da Vizinha, te aviso por aqui."
    );
    return true;
  }

  if (lead.stage === "confirmed") {
    await updateLead(lead.id, { lastInboundText: job.text });
    await sendAndTrack(
      job,
      lead,
      "Seu pedido já está confirmado. Se quiser fazer outro, eu organizo um novo resumo por aqui."
    );
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

  const handledByFunnel = await handleLeadFunnel(job, lead);

  if (handledByFunnel) {
    return;
  }

  const matchedFlow = await findMatchingFlow(job.instanceId, job.text);

  if (matchedFlow) {
    await sendAndTrack(job, lead, matchedFlow.resposta);
    await updateLead(lead.id, { lastInboundText: job.text });
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
        bairroRetirada: agentResult.bairroRetirada ?? lead.bairroRetirada,
        observacoes: agentResult.observacoes ?? lead.observacoes,
      });
      return;
    }
  }

  if (isGreeting(normalized)) {
    await updateLead(lead.id, {
      stage: "awaiting_intent",
      lastInboundText: job.text,
    });
    await sendIntro(job, lead);
    return;
  }

  await sendAndTrack(
    job,
    lead,
    [
      "Posso te ajudar com isso, sim.",
      `Se quiser ver o cardápio: ${config.cardapioUrl}`,
      "Se for encomenda, me responda com *1* para eu organizar seu pedido.",
    ].join("\n\n")
  );

  await updateLead(lead.id, { lastInboundText: job.text });
}
