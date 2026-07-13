import { NextResponse } from "next/server";

import { isValidManhiaSessionToken, MANHIA_COOKIE_NAME } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

function unauthorizedResponse() {
  return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
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

function parseBody(body: {
  name?: string;
  description?: string | null;
  minQuantity?: number | string | null;
  allowsMultiple?: boolean;
}) {
  const name = body.name?.trim() || "";
  const minQuantity =
    body.minQuantity === null || body.minQuantity === "" || typeof body.minQuantity === "undefined"
      ? null
      : Number(body.minQuantity);

  if (!name) {
    return { error: "Informe o nome do tipo." };
  }

  if (minQuantity !== null && (!Number.isInteger(minQuantity) || minQuantity < 1)) {
    return { error: "Quantidade mínima invalida." };
  }

  return {
    data: {
      name,
      description: body.description?.trim() || null,
      minQuantity,
      allowsMultiple: body.allowsMultiple ?? true,
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
    const parsed = parseBody(await req.json());

    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const type = await prisma.productType.update({
      where: { id },
      data: parsed.data,
      include: { _count: { select: { products: true } } },
    });

    return NextResponse.json(type);
  } catch (error) {
    console.error("PATCH /api/manhia/product-types/[id] error", error);
    return NextResponse.json({ error: "Erro ao atualizar tipo." }, { status: 500 });
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
    const linkedProducts = await prisma.produto.count({
      where: { productTypeId: id },
    });

    if (linkedProducts > 0) {
      return NextResponse.json(
        { error: `Existem ${linkedProducts} produto(s) vinculados a este tipo.` },
        { status: 409 }
      );
    }

    await prisma.productType.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/manhia/product-types/[id] error", error);
    return NextResponse.json({ error: "Erro ao excluir tipo." }, { status: 500 });
  }
}
