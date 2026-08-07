import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/pedidos";
import { sendWhatsappText } from "@/lib/whatsapp";

export const maxDuration = 300;

const MIN_DELAY_SECONDS = 10;
const MAX_DELAY_SECONDS = 60;
const BATCH_SIZE = 10;

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
      where: {
        status: { not: "CANCELLED" },
        customerPhone: { not: null },
      },
      select: { customerPhone: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return Array.from(
    new Set(
      [
        ...pedidos.map((pedido) => pedido.clienteTelefone),
        ...orders.map((order) => order.customerPhone || ""),
      ]
        .map(normalizePhone)
        .filter(Boolean),
    ),
  );
}

export async function GET(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const phones = await getCustomerPhones();
  return NextResponse.json({ total: phones.length, minimumDelaySeconds: MIN_DELAY_SECONDS });
}

export async function POST(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    message?: unknown;
    delaySeconds?: unknown;
    cursor?: unknown;
  } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const delaySeconds = Math.min(
    MAX_DELAY_SECONDS,
    Math.max(MIN_DELAY_SECONDS, Math.round(Number(body?.delaySeconds) || 15)),
  );
  const cursor = Math.max(0, Math.floor(Number(body?.cursor) || 0));

  if (!message || message.length > 1500) {
    return NextResponse.json(
      { error: "Escreva uma mensagem de até 1.500 caracteres." },
      { status: 400 },
    );
  }

  const phones = await getCustomerPhones();
  const recipients = phones.slice(cursor, cursor + BATCH_SIZE);
  let sent = 0;
  const failures: Array<{ position: number; error: string }> = [];

  for (let index = 0; index < recipients.length; index += 1) {
    if (index > 0 || cursor > 0) {
      // Pequena variação evita que os disparos saiam em uma cadência mecânica exata.
      await delay(delaySeconds * 1000 + Math.floor(Math.random() * 3000));
    }

    try {
      const result = await sendWhatsappText(recipients[index], message);
      if (result && "ok" in result && result.ok === false) {
        throw new Error("Serviço de WhatsApp indisponível.");
      }
      sent += 1;
    } catch (error) {
      console.error("Bulk WhatsApp message failed", { cursor, index, error });
      failures.push({
        position: cursor + index + 1,
        error: error instanceof Error ? error.message : "Falha no envio.",
      });
    }
  }

  const nextCursor = cursor + recipients.length;
  return NextResponse.json({
    total: phones.length,
    processed: recipients.length,
    sent,
    failures,
    nextCursor: nextCursor < phones.length ? nextCursor : null,
  });
}
