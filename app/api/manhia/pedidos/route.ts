import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";

export async function GET(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const pedidos = await prisma.pedido.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        itens: true,
        produto: true,
      },
    });

    return NextResponse.json(pedidos);
  } catch (error) {
    console.error("GET /api/manhia/pedidos error", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os pedidos." },
      { status: 500 }
    );
  }
}
