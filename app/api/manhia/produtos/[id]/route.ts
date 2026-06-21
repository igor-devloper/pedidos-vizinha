import { NextResponse } from "next/server";

import { isValidManhiaSessionToken, MANHIA_COOKIE_NAME } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/pedidos";
import { type ProdutoPayloadInput, validateProdutoPayload } from "@/lib/produtos";

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
  return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
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

    const produto = await prisma.produto.update({
      where: { id },
      data: {
        ...validation.data,
        slug:
          existing && existing.id !== id
            ? `${slugBase}-${Date.now().toString(36)}`
            : slugBase,
      } as never,
      include: { productType: true },
    });

    return NextResponse.json({ ...produto, productTypeName: produto.productType?.name || null });
  } catch (error) {
    console.error("PATCH /api/manhia/produtos/[id] error", error);
    return NextResponse.json({ error: "Erro ao atualizar produto." }, { status: 500 });
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
    return NextResponse.json({ error: "Erro ao excluir produto." }, { status: 500 });
  }
}
