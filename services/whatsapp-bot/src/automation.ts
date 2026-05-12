import { config } from "./config.js";
import { findMatchingFlow } from "./flow-repository.js";
import { runSalesAgent } from "./gemini-sales-agent.js";
import { instanceManager } from "./instance-manager.js";
import { getOrCreateLead, updateLead, type BotLead } from "./lead-repository.js";
import { logger } from "./logger.js";
import type { InboundMessageJob } from "./types.js";

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isGreeting(text: string) {
  return ["oi", "ola", "olá", "menu", "cardapio", "cardapio por favor"].includes(text);
}

function isHumanHandoff(text: string) {
  return (
    text === "2" ||
    text.includes("atendente") ||
    text.includes("humano") ||
    text.includes("falar com alguem")
  );
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

  logger.info(
    {
      instanceId: job.instanceId,
      remoteJid: job.remoteJid,
      leadId: lead?.id || null,
    },
    "Outbound message sent successfully"
  );

  if (lead) {
    await updateLead(lead.id, { lastOutboundText: text });
  }
}

async function sendIntro(job: InboundMessageJob, lead: BotLead | null) {
  await sendAndTrack(
    job,
    lead,
    [
      "🌸 *Oi! Seja bem-vinda(o) à Vizinha Salgateria.*",
      "",
      "Vou te ajudar por aqui com calma e carinho 💗",
      "",
      `📋 *Nosso cardápio:* ${config.cardapioUrl}`,
      "",
      "Para eu te orientar melhor, me responde com uma opção:",
      "",
      "*1* - Quero fazer uma encomenda",
      "*2* - Quero saber retirada e endereço",
      "*3* - Quero saber valores e sabores",
    ].join("\n")
  );
}

async function handleQualifiedSummary(job: InboundMessageJob, lead: BotLead) {
  const summary = [
    "✨ *Perfeito! Já deixei seu atendimento organizado:*",
    "",
    `*Nome:* ${lead.nome || "Não informado"}`,
    `*Interesse:* ${lead.intent || "Não informado"}`,
    `*Detalhes:* ${lead.eventoDetalhes || "Não informado"}`,
    `*Retirada / bairro:* ${lead.bairroRetirada || "Não informado"}`,
    `*Observações:* ${lead.observacoes || "Nenhuma"}`,
    "",
    `📍 *Retirada:* ${config.pickupAddress}`,
    config.pickupReference ? `📌 *Referência:* ${config.pickupReference}` : "",
    `🕒 *Horário:* ${config.pickupHours}`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendAndTrack(job, lead, summary);
  await updateLead(lead.id, { stage: "qualified", status: "qualified" });
}

async function handleLeadFunnel(job: InboundMessageJob, lead: BotLead) {
  const text = normalizeText(job.text);

  if (isHumanHandoff(text)) {
    await updateLead(lead.id, {
      stage: "awaiting_location",
      status: "open",
      lastInboundText: job.text,
    });
    await sendAndTrack(
      job,
      lead,
      [
        "💗 Consigo continuar com você por aqui mesmo.",
        "",
        `📍 *Endereço de retirada:* ${config.pickupAddress}`,
        config.pickupReference ? `📌 *Referência:* ${config.pickupReference}` : "",
        `🕒 *Horário de retirada:* ${config.pickupHours}`,
      ]
        .filter(Boolean)
        .join("\n")
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
        stage: "awaiting_event_details",
        intent: "encomenda",
        lastInboundText: job.text,
      });
      await sendAndTrack(
        job,
        lead,
        "Perfeito 💗\n\nMe conta com calma o que você precisa: *data*, *tipo de evento* e *quantidade aproximada*."
      );
      return true;
    }

    if (text === "3") {
      await updateLead(lead.id, {
        stage: "awaiting_event_details",
        intent: "valores e sabores",
        lastInboundText: job.text,
      });
      await sendAndTrack(
        job,
        lead,
        "Claro ✨\n\nMe diz com calma o que você quer cotar ou quais *sabores* te interessam."
      );
      return true;
    }

    await sendIntro(job, lead);
    return true;
  }

  if (lead.stage === "awaiting_event_details") {
    await updateLead(lead.id, {
      stage: "awaiting_name",
      eventoDetalhes: job.text,
      lastInboundText: job.text,
    });
    await sendAndTrack(job, lead, "🌷 Certo. Me fala seu *nome*, por favor?");
    return true;
  }

  if (lead.stage === "awaiting_name") {
    await updateLead(lead.id, {
      stage: "awaiting_location",
      nome: job.text,
      lastInboundText: job.text,
    });
    await sendAndTrack(
      job,
      lead,
      "💗 Obrigada. Como aqui trabalhamos com *retirada*, me diz seu *bairro* ou como prefere combinar a retirada."
    );
    return true;
  }

  if (lead.stage === "awaiting_location") {
    await updateLead(lead.id, {
      stage: "awaiting_notes",
      bairroRetirada: job.text,
      lastInboundText: job.text,
    });
    await sendAndTrack(
      job,
      lead,
      "📝 Tem mais alguma observação importante?\n\nSe não tiver, pode responder *não*."
    );
    return true;
  }

  if (lead.stage === "awaiting_notes") {
    const notes =
      text === "nao" || text === "não" ? "Sem observações adicionais" : job.text;
    const updatedLead = await updateLead(lead.id, {
      observacoes: notes,
      lastInboundText: job.text,
    });
    await handleQualifiedSummary(job, updatedLead || lead);
    return true;
  }

  if (lead.stage === "qualified" || lead.stage === "handoff") {
    await sendAndTrack(
      job,
      lead,
      `🌸 Seu atendimento já está em andamento por aqui.\n\nSe quiser, posso te enviar o cardápio novamente:\n${config.cardapioUrl}`
    );
    await updateLead(lead.id, { lastInboundText: job.text });
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

  const lead = await getOrCreateLead({
    instanceId: job.instanceId,
    remoteJid: job.remoteJid,
    pushName: job.pushName,
  });

  logger.info(
    {
      instanceId: job.instanceId,
      remoteJid: job.remoteJid,
      leadId: lead?.id || null,
      leadStage: lead?.stage || null,
      leadStatus: lead?.status || null,
    },
    "Lead resolved for inbound message"
  );

  if (config.geminiApiKey) {
    const agentResult = await runSalesAgent(job, lead);

    if (agentResult?.reply) {
      await sendAndTrack(job, lead, agentResult.reply);

      if (lead) {
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
      }

      logger.info(
        {
          instanceId: job.instanceId,
          remoteJid: job.remoteJid,
        },
        "Gemini sales agent handled the message"
      );
      return;
    }
  }

  if (lead) {
    const handledByFunnel = await handleLeadFunnel(job, lead);
    logger.info(
      {
        instanceId: job.instanceId,
        remoteJid: job.remoteJid,
        leadId: lead.id,
        handledByFunnel,
      },
      "Lead funnel evaluation finished"
    );

    if (handledByFunnel) {
      return;
    }
  }

  const matchedFlow = await findMatchingFlow(job.instanceId, job.text);

  logger.info(
    {
      instanceId: job.instanceId,
      remoteJid: job.remoteJid,
      matchedFlowId: matchedFlow?.id || null,
      matchedFlowName: matchedFlow?.nome || null,
    },
    "Visual flow lookup finished"
  );

  if (matchedFlow) {
    await sendAndTrack(job, lead, matchedFlow.resposta);
    if (lead) {
      await updateLead(lead.id, { lastInboundText: job.text });
    }
    logger.info(
      { instanceId: job.instanceId, flowId: matchedFlow.id, flowName: matchedFlow.nome },
      "Matched visual bot flow"
    );
    return;
  }

  if (isGreeting(normalized)) {
    logger.info(
      {
        instanceId: job.instanceId,
        remoteJid: job.remoteJid,
      },
      "Greeting fallback matched"
    );

    if (lead) {
      await updateLead(lead.id, {
        stage: "awaiting_intent",
        lastInboundText: job.text,
      });
    }
    await sendIntro(job, lead);
    return;
  }

  if (!lead) {
    logger.warn(
      {
        instanceId: job.instanceId,
        remoteJid: job.remoteJid,
      },
      "Lead could not be loaded; sending intro fallback without persistence"
    );
    await sendIntro(job, null);
    return;
  }

  await sendAndTrack(
    job,
    lead,
    [
      "💗 Posso te ajudar com isso sim.",
      "",
      `Se quiser, dá uma olhada no cardápio aqui: ${config.cardapioUrl}`,
      "",
      "Se preferir, me diz o que você está procurando e eu sigo te orientando por aqui.",
    ].join("\n")
  );

  await updateLead(lead.id, { lastInboundText: job.text });

  logger.info(
    { instanceId: job.instanceId, text: job.text, leadStage: lead.stage },
    "Default sales fallback sent"
  );
}
