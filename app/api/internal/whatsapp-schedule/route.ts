import { NextResponse } from "next/server";
import { OrderStatus, PedidoStatus } from "@prisma/client";

import { getFullStoreStatus } from "@/lib/business-hours";
import { prisma } from "@/lib/db";
import { hasValidInternalAuthorization } from "@/lib/internal-auth";
import { businessInstantToFixedUtcLocal } from "@/lib/scheduled-at";
import { checkSchedule } from "@/lib/whatsapp-schedule";

// Valida data/hora com as mesmas regras do checkout do site (horário, antecedência, horário já reservado).
export async function POST(request: Request) {
  if (!hasValidInternalAuthorization(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    scheduledAt?: string;
    productIds?: string[];
  } | null;
  const scheduledAt = new Date(String(body?.scheduledAt ?? ""));
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ ok: false, reason: "Data e horário inválidos.", suggestions: [] });
  }

  const productIds = Array.isArray(body?.productIds) ? body.productIds : [];
  const [settings, products] = await Promise.all([
    getFullStoreStatus(),
    productIds.length
      ? prisma.produto.findMany({ where: { id: { in: productIds } }, select: { antecedenciaMinimaHoras: true } })
      : Promise.resolve([]),
  ]);

  const leadHours = Math.max(
    settings.minimumLeadHours,
    ...products.map((product) => product.antecedenciaMinimaHoras ?? settings.minimumLeadHours),
  );

  const check = checkSchedule(scheduledAt, {
    operationSchedule: settings.operationSchedule,
    minimumLeadHours: leadHours,
    storeOpenManually: !settings.closedByOwner,
  });
  if (!check.ok) {
    return NextResponse.json({ ...check, minimumLeadHours: leadHours });
  }

  if (!settings.allowMultipleOrdersPerSlot) {
    const conflict =
      (await prisma.order.findFirst({
        where: { scheduledAt: businessInstantToFixedUtcLocal(scheduledAt), status: { not: OrderStatus.CANCELLED } },
        select: { id: true },
      })) ||
      (await prisma.pedido.findFirst({
        where: { dataEntrega: scheduledAt, status: { not: PedidoStatus.CANCELADO } },
        select: { id: true },
      }));
    if (conflict) {
      return NextResponse.json({
        ok: false,
        reason: "Esse horário já está reservado para outro pedido.",
        suggestions: ["Escolha outro horário, com alguns minutos de diferença"],
        minimumLeadHours: leadHours,
      });
    }
  }

  return NextResponse.json({ ok: true, minimumLeadHours: leadHours });
}
