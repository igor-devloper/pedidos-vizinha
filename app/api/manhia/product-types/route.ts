import { NextResponse } from "next/server";

import { isValidManhiaSessionToken, MANHIA_COOKIE_NAME } from "@/lib/admin-auth";
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
    return { error: "Quantidade minima invalida." };
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

export async function GET(req: Request) {
  if (!isValidManhiaSessionToken(getToken(req))) {
    return unauthorizedResponse();
  }

  const types = await prisma.productType.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return NextResponse.json(types);
}

export async function POST(req: Request) {
  if (!isValidManhiaSessionToken(getToken(req))) {
    return unauthorizedResponse();
  }

  try {
    const parsed = parseBody(await req.json());

    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const type = await prisma.productType.create({
      data: parsed.data,
      include: { _count: { select: { products: true } } },
    });

    return NextResponse.json(type, { status: 201 });
  } catch (error) {
    console.error("POST /api/manhia/product-types error", error);
    return NextResponse.json({ error: "Erro ao criar tipo." }, { status: 500 });
  }
}
