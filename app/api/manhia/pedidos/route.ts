import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import {
  processPaidPedidosSideEffects,
  processReadyPedidoToleranceReminders,
} from "@/lib/pedido-service";
import {
  processPaidCartOrdersSideEffects,
  serializeCartOrderForAdmin,
} from "@/lib/cart-order-service";

export async function GET(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    await processReadyPedidoToleranceReminders();
    await processPaidPedidosSideEffects();
    await processPaidCartOrdersSideEffects();

    const pedidos = await prisma.pedido.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        itens: true,
        produto: true,
      },
    });

    const orders = await prisma.order.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: { items: true },
      take: 50,
    });

    return NextResponse.json({
      pedidos,
      simpleOrders: orders.map(serializeCartOrderForAdmin),
    });
  } catch (error) {
    console.error("GET /api/manhia/pedidos error", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os pedidos." },
      { status: 500 },
    );
  }
}
