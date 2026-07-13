import { NextResponse } from "next/server";

import { isValidManhiaSessionToken, MANHIA_COOKIE_NAME } from "@/lib/admin-auth";
import { type CupomPayloadInput, validateCupomPayload } from "@/lib/cupons";
import { prisma } from "@/lib/db";

function getToken(req: Request) {
  return (
    req.headers.get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${MANHIA_COOKIE_NAME}=`))
      ?.split("=")[1] || ""
  );
}

function unauthorizedResponse() {
  return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
}

function serializeCupom(cupom: {
  id: string;
  codigo: string;
  produtoId: string;
  produto: { nome: string };
  divulgadorNome: string;
  divulgadorContato: string | null;
  descricao: string | null;
  descontoPercentual: unknown;
  ativo: boolean;
  createdAt: Date;
}) {
  return {
    id: cupom.id,
    codigo: cupom.codigo,
    produtoId: cupom.produtoId,
    produtoNome: cupom.produto.nome,
    divulgadorNome: cupom.divulgadorNome,
    divulgadorContato: cupom.divulgadorContato,
    descricao: cupom.descricao,
    descontoPercentual: Number(cupom.descontoPercentual),
    ativo: cupom.ativo,
    createdAt: cupom.createdAt.toISOString(),
  };
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isValidManhiaSessionToken(getToken(req))) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await context.params;
    const body = (await req.json()) as CupomPayloadInput;
    const validation = validateCupomPayload(body);

    if ("error" in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const produto = await prisma.produto.findUnique({
      where: { id: validation.data.produtoId },
      select: { id: true },
    });

    if (!produto) {
      return NextResponse.json({ error: "Produto do cupom não encontrado." }, { status: 404 });
    }

    const existing = await prisma.cupomDesconto.findUnique({
      where: { codigo: validation.data.codigo },
      select: { id: true },
    });

    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "Já existe um cupom com esse código." }, { status: 409 });
    }

    const cupom = await prisma.cupomDesconto.update({
      where: { id },
      data: validation.data,
      include: {
        produto: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });

    return NextResponse.json(serializeCupom(cupom));
  } catch (error) {
    console.error("PATCH /api/manhia/cupons/[id] error", error);
    return NextResponse.json({ error: "Erro ao atualizar cupom." }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isValidManhiaSessionToken(getToken(req))) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await context.params;

    await prisma.cupomDesconto.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/manhia/cupons/[id] error", error);
    return NextResponse.json({ error: "Erro ao excluir cupom." }, { status: 500 });
  }
}
