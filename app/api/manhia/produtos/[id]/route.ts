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

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isValidManhiaSessionToken(getToken(req))) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await context.params;
    const body = (await req.json()) as ProdutoPayload;
    const validation = validateProdutoPayload(body);

    if ("error" in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const produto = await prisma.produto.update({
      where: { id },
      data: validation.data,
    });

    return NextResponse.json(produto);
  } catch (error) {
    console.error("PATCH /api/manhia/produtos/[id] error", error);
    return NextResponse.json(
      { error: "Erro ao atualizar produto." },
      { status: 500 }
    );
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

    await prisma.produto.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/manhia/produtos/[id] error", error);
    return NextResponse.json(
      { error: "Erro ao excluir produto." },
      { status: 500 }
    );
  }
}
