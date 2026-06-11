import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { normalizeCouponCode } from "@/lib/descontos";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { codigo?: string; produtoId?: string };
    const produtoId = body.produtoId?.trim() || "";
    const codigo = normalizeCouponCode(body.codigo);

    if (!codigo) {
      return NextResponse.json({ error: "Informe o cupom." }, { status: 400 });
    }

    if (!produtoId) {
      return NextResponse.json({ error: "Informe o produto do cupom." }, { status: 400 });
    }

    const cupom = await prisma.cupomDesconto.findFirst({
      where: {
        codigo,
        produtoId,
      },
      select: {
        codigo: true,
        divulgadorNome: true,
        descontoPercentual: true,
        ativo: true,
      },
    });

    if (!cupom || !cupom.ativo) {
      return NextResponse.json({ error: "Cupom invalido ou inativo." }, { status: 404 });
    }

    return NextResponse.json({
      codigo: cupom.codigo,
      divulgadorNome: cupom.divulgadorNome,
      descontoPercentual: Number(cupom.descontoPercentual),
    });
  } catch (error) {
    console.error("POST /api/cupons/validar error", error);
    return NextResponse.json({ error: "Nao foi possivel validar o cupom." }, { status: 400 });
  }
}
