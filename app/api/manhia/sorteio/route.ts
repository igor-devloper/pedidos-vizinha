import { randomInt } from "crypto";
import { OrderStatus, PedidoStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

const eligibleWhere: Prisma.RaffleEntryWhereInput = {
  OR: [
    {
      pedido: {
        status: {
          in: [
            PedidoStatus.PAGO,
            PedidoStatus.EM_PREPARO,
            PedidoStatus.PRONTO,
            PedidoStatus.ENTREGUE,
          ],
        },
      },
    },
    {
      order: {
        status: {
          in: [OrderStatus.PAID, OrderStatus.READY, OrderStatus.DELIVERED],
        },
      },
    },
  ],
};

export async function GET(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const [entries, draws] = await Promise.all([
    prisma.raffleEntry.findMany({
      where: eligibleWhere,
      orderBy: { createdAt: "desc" },
      include: {
        pedido: { select: { codigo: true } },
        order: { select: { code: true } },
      },
    }),
    prisma.raffleDraw.findMany({
      orderBy: { drawnAt: "desc" },
      include: { entry: true },
      take: 20,
    }),
  ]);

  return NextResponse.json({ entries, draws });
}

export async function POST(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const candidates = await prisma.raffleEntry.findMany({
    where: {
      ...eligibleWhere,
      draws: { none: {} },
    },
  });

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "Não há códigos pagos disponíveis para um novo sorteio." },
      { status: 400 },
    );
  }

  const winner = candidates[randomInt(candidates.length)];
  const draw = await prisma.raffleDraw.create({
    data: { entryId: winner.id },
    include: { entry: true },
  });

  return NextResponse.json({ draw });
}
