import { NextResponse } from "next/server";

import { isValidManhiaSessionToken, MANHIA_COOKIE_NAME } from "@/lib/admin-auth";
import { type CupomPayloadInput, validateCupomPayload } from "@/lib/cupons";
import { prisma } from "@/lib/db";

function unauthorizedResponse() {
  return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
}

function getToken(req: Request) {
  return (
    req.headers.get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${MANHIA_COOKIE_NAME}=`))
      ?.split("=")[1] || ""
  );
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

export async function GET(req: Request) {
  if (!isValidManhiaSessionToken(getToken(req))) {
    return unauthorizedResponse();
  }

  try {
    const cupons = await prisma.cupomDesconto.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        produto: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });

    return NextResponse.json(cupons.map(serializeCupom));
  } catch (error) {
    console.error("GET /api/manhia/cupons error", error);
    return NextResponse.json({ error: "Erro ao carregar cupons." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isValidManhiaSessionToken(getToken(req))) {
    return unauthorizedResponse();
  }

  try {
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
      return NextResponse.json({ error: "Produto do cupom nao encontrado." }, { status: 404 });
    }

    const existing = await prisma.cupomDesconto.findUnique({
      where: { codigo: validation.data.codigo },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ error: "Ja existe um cupom com esse codigo." }, { status: 409 });
    }

    const cupom = await prisma.cupomDesconto.create({
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

    return NextResponse.json(serializeCupom(cupom), { status: 201 });
  } catch (error) {
    console.error("POST /api/manhia/cupons error", error);
    return NextResponse.json({ error: "Erro ao criar cupom." }, { status: 500 });
  }
}
