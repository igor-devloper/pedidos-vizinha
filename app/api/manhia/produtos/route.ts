import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isValidManhiaSessionToken, MANHIA_COOKIE_NAME } from "@/lib/admin-auth";

type ProdutoPayload = {
  nome?: string;
  descricao?: string;
  preco?: number | string;
  imagemBase64?: string;
  categoria?: "CENTO" | "LANCHONETE";
  ativo?: boolean;
};

function unauthorizedResponse() {
  return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
}

function validateProdutoPayload(body: ProdutoPayload) {
  const nome = body.nome?.trim() || "";
  const descricao = body.descricao?.trim() || "";
  const preco = Number(body.preco);
  const imagemBase64 = body.imagemBase64?.trim() || "";
  const categoria: "CENTO" | "LANCHONETE" =
    body.categoria === "LANCHONETE" ? "LANCHONETE" : "CENTO";
  const ativo = body.ativo ?? true;

  if (!nome) {
    return { error: "Informe o nome do produto." };
  }

  if (!descricao) {
    return { error: "Informe a descricao do produto." };
  }

  if (!Number.isFinite(preco) || preco <= 0) {
    return { error: "Informe um valor valido." };
  }

  if (!imagemBase64.startsWith("data:image/")) {
    return { error: "Envie uma imagem valida para o produto." };
  }

  if (imagemBase64.length > 2_500_000) {
    return { error: "A imagem ficou muito grande. Tente um arquivo menor." };
  }

  return {
    data: {
      nome,
      descricao,
      preco: Number(preco.toFixed(2)),
      imagemBase64,
      categoria,
      ativo,
    },
  };
}

export async function GET(req: Request) {
  const token =
    req.headers.get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${MANHIA_COOKIE_NAME}=`))
      ?.split("=")[1] || "";

  if (!isValidManhiaSessionToken(token)) {
    return unauthorizedResponse();
  }

  try {
    const produtos = await prisma.produto.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(produtos);
  } catch (error) {
    console.error("GET /api/manhia/produtos error", error);
    return NextResponse.json(
      { error: "Erro ao carregar produtos." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const token =
    req.headers.get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${MANHIA_COOKIE_NAME}=`))
      ?.split("=")[1] || "";

  if (!isValidManhiaSessionToken(token)) {
    return unauthorizedResponse();
  }

  try {
    const body = (await req.json()) as ProdutoPayload;
    const validation = validateProdutoPayload(body);

    if ("error" in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const produto = await prisma.produto.create({
      data: validation.data,
    });

    return NextResponse.json(produto, { status: 201 });
  } catch (error) {
    console.error("POST /api/manhia/produtos error", error);
    return NextResponse.json(
      { error: "Erro ao criar produto." },
      { status: 500 }
    );
  }
}
