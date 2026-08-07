import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/pedidos";
import { sendWhatsappText } from "@/lib/whatsapp";

export const maxDuration = 300;

const MIN_DELAY_SECONDS = 10;
const MAX_DELAY_SECONDS = 60;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCustomerPhones() {
  const [pedidos, orders] = await Promise.all([
    prisma.pedido.findMany({
      where: { status: { not: "CANCELADO" } },
      select: { clienteTelefone: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.findMany({
      where: { status: { not: "CANCELLED" }, customerPhone: { not: null } },
      select: { customerPhone: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return Array.from(new Set([
    ...pedidos.map((item) => item.clienteTelefone),
    ...orders.map((item) => item.customerPhone || ""),
  ].map(normalizePhone).filter(Boolean)));
}

function campaignPayload(campaign: {
  id: string; status: string; total: number; sent: number; failed: number;
}) {
  return {
    id: campaign.id,
    campaignId: campaign.id,
    status: campaign.status,
    total: campaign.total,
    processed: campaign.sent + campaign.failed,
    sent: campaign.sent,
    failed: campaign.failed,
  };
}

export async function GET(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  return NextResponse.json({ total: (await getCustomerPhones()).length, minimumDelaySeconds: MIN_DELAY_SECONDS });
}

export async function POST(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    action?: unknown; message?: unknown; delaySeconds?: unknown; campaignId?: unknown;
  } | null;
  const action = body?.action;

  if (action === "create") {
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 1500) {
      return NextResponse.json({ error: "Escreva uma mensagem de até 1.500 caracteres." }, { status: 400 });
    }
    const delaySeconds = Math.min(MAX_DELAY_SECONDS, Math.max(MIN_DELAY_SECONDS, Math.round(Number(body?.delaySeconds) || 15)));
    const phones = await getCustomerPhones();
    const previouslySent = await prisma.whatsappCampaignRecipient.findMany({
      where: { status: "SENT", campaign: { message } },
      select: { phone: true },
      distinct: ["phone"],
    });
    const previouslySentPhones = new Set(previouslySent.map((item) => item.phone));
    const pendingPhones = phones.filter((phone) => !previouslySentPhones.has(phone));
    if (pendingPhones.length === 0) {
      return NextResponse.json({ error: "Esta mensagem já foi enviada para todos os clientes encontrados." }, { status: 400 });
    }
    const campaign = await prisma.whatsappCampaign.create({
      data: {
        message,
        delaySeconds,
        total: pendingPhones.length,
        recipients: { create: pendingPhones.map((phone) => ({ phone })) },
      },
    });
    return NextResponse.json({
      ...campaignPayload(campaign),
      previouslySent: phones.length - pendingPhones.length,
    });
  }

  const bodyWithId = body as (typeof body & { id?: unknown });
  const campaignId =
    typeof body?.campaignId === "string"
      ? body.campaignId.trim()
      : typeof bodyWithId?.id === "string"
        ? bodyWithId.id.trim()
        : "";
  if (!campaignId) {
    return NextResponse.json({ error: "Campanha inválida." }, { status: 400 });
  }

  if (action === "stop") {
    const campaign = await prisma.whatsappCampaign.update({
      where: { id: campaignId },
      data: { status: "STOPPED" },
    });
    return NextResponse.json(campaignPayload(campaign));
  }

  if (action !== "process") {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  let campaign = await prisma.whatsappCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
  if (campaign.status !== "RUNNING") return NextResponse.json(campaignPayload(campaign));

  const recipient = await prisma.whatsappCampaignRecipient.findFirst({
    where: { campaignId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  if (!recipient) {
    campaign = await prisma.whatsappCampaign.update({ where: { id: campaignId }, data: { status: "COMPLETED" } });
    return NextResponse.json(campaignPayload(campaign));
  }

  const claimed = await prisma.whatsappCampaignRecipient.updateMany({
    where: { id: recipient.id, status: "PENDING" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) return NextResponse.json(campaignPayload(campaign));

  if (campaign.lastSentAt) {
    const targetTime = campaign.lastSentAt.getTime() + campaign.delaySeconds * 1000 + Math.floor(Math.random() * 3000);
    while (Date.now() < targetTime) {
      await delay(Math.min(1000, targetTime - Date.now()));
      const state = await prisma.whatsappCampaign.findUnique({ where: { id: campaignId }, select: { status: true } });
      if (state?.status !== "RUNNING") {
        await prisma.whatsappCampaignRecipient.update({ where: { id: recipient.id }, data: { status: "PENDING" } });
        const stopped = await prisma.whatsappCampaign.findUniqueOrThrow({ where: { id: campaignId } });
        return NextResponse.json(campaignPayload(stopped));
      }
    }
  }

  try {
    const result = await sendWhatsappText(recipient.phone, campaign.message);
    if (result && "ok" in result && result.ok === false) throw new Error("Serviço de WhatsApp indisponível.");
    const now = new Date();
    await prisma.$transaction([
      prisma.whatsappCampaignRecipient.update({ where: { id: recipient.id }, data: { status: "SENT", sentAt: now } }),
      prisma.whatsappCampaign.update({ where: { id: campaignId }, data: { sent: { increment: 1 }, lastSentAt: now } }),
    ]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha no envio.";
    await prisma.$transaction([
      prisma.whatsappCampaignRecipient.update({ where: { id: recipient.id }, data: { status: "FAILED", error: errorMessage } }),
      prisma.whatsappCampaign.update({ where: { id: campaignId }, data: { failed: { increment: 1 } } }),
    ]);
  }

  campaign = await prisma.whatsappCampaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.sent + campaign.failed >= campaign.total) {
    campaign = await prisma.whatsappCampaign.update({ where: { id: campaignId }, data: { status: "COMPLETED" } });
  }
  return NextResponse.json(campaignPayload(campaign));
}
