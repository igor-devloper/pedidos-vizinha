import { NextResponse } from "next/server";
import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const transferredAt = new Date();
  const [orders, pedidos] = await prisma.$transaction([
    prisma.order.updateMany({ where: { provisionAmount: { gt: 0 }, provisionTransferredAt: null }, data: { provisionTransferredAt: transferredAt } }),
    prisma.pedido.updateMany({ where: { provisionAmount: { gt: 0 }, provisionTransferredAt: null }, data: { provisionTransferredAt: transferredAt } }),
  ]);
  return NextResponse.json({ transferredAt: transferredAt.toISOString(), count: orders.count + pedidos.count });
}
