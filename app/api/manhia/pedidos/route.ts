import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { MANHIA_ORDER_HISTORY_QUERY, MANHIA_PEDIDO_HISTORY_QUERY } from "@/lib/order-history";
import {
  processPaidPedidosSideEffects,
  processReadyPedidoToleranceReminders,
} from "@/lib/pedido-service";
import {
  processPaidCartOrdersSideEffects,
  processReadyCartOrderBalanceCharges,
  serializeCartOrderForAdmin,
} from "@/lib/cart-order-service";

export async function GET(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const sideEffects = await Promise.allSettled([
      processReadyPedidoToleranceReminders(),
      processPaidPedidosSideEffects(),
      processPaidCartOrdersSideEffects(),
      processReadyCartOrderBalanceCharges(),
    ]);
    sideEffects.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error("Manhia refresh side effect failed", {
          operation: ["ready-tolerance", "paid-pedidos", "paid-cart-orders", "ready-balance-charges"][index],
          error: result.reason,
        });
      }
    });

    const pedidos = await prisma.pedido.findMany(MANHIA_PEDIDO_HISTORY_QUERY);

    const orders = await prisma.order.findMany(MANHIA_ORDER_HISTORY_QUERY);

    console.info("[manhia] order history loaded", {
      pedidoCount: pedidos.length,
      orderCount: orders.length,
      cancelledPedidoCount: pedidos.filter((pedido) => pedido.status === "CANCELADO").length,
      cancelledOrderCount: orders.filter((order) => order.status === "CANCELLED").length,
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
