import { NextResponse } from "next/server";

import { isValidManhiaSessionToken, MANHIA_COOKIE_NAME } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/pedidos";
import { type ProdutoPayloadInput, validateProdutoPayload } from "@/lib/produtos";

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

export async function GET(req: Request) {
  if (!isValidManhiaSessionToken(getToken(req))) {
    return unauthorizedResponse();
  }

  try {
    const produtos = await prisma.produto.findMany({
      orderBy: { createdAt: "desc" },
      include: { productType: true },
    });

    return NextResponse.json(
      produtos.map((produto) => ({
        ...produto,
        productTypeName: produto.productType?.name || null,
      }))
    );
  } catch (error) {
    console.error("GET /api/manhia/produtos error", error);
    return NextResponse.json({ error: "Erro ao carregar produtos." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isValidManhiaSessionToken(getToken(req))) {
    return unauthorizedResponse();
  }

  try {
    const body = (await req.json()) as ProdutoPayloadInput;
    const validation = validateProdutoPayload(body);

    if ("error" in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const slugBase = slugify(validation.data.nome);
    const existing = await prisma.produto.findUnique({
      where: { slug: slugBase },
      select: { id: true },
    });

    const produto = await prisma.produto.create({
      data: {
        ...validation.data,
        slug: existing ? `${slugBase}-${Date.now().toString(36)}` : slugBase,
      } as never,
      include: { productType: true },
    });

    return NextResponse.json(
      { ...produto, productTypeName: produto.productType?.name || null },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/manhia/produtos error", error);
    return NextResponse.json({ error: "Erro ao criar produto." }, { status: 500 });
  }
}
