import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const settings = await prisma.storeSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton", isOpen: true, minimumLeadHours: 2 },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("GET /api/manhia/configuracoes error", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as configurações." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      isOpen?: boolean;
      minimumLeadHours?: number;
    } | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }

    const patch: { isOpen?: boolean; minimumLeadHours?: number } = {};

    if (typeof body.isOpen === "boolean") {
      patch.isOpen = body.isOpen;
    }

    if (typeof body.minimumLeadHours === "number" && body.minimumLeadHours >= 0) {
      patch.minimumLeadHours = Math.round(body.minimumLeadHours);
    }

    const settings = await prisma.storeSettings.upsert({
      where: { id: "singleton" },
      update: patch,
      create: {
        id: "singleton",
        isOpen: patch.isOpen ?? true,
        minimumLeadHours: patch.minimumLeadHours ?? 2,
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("PATCH /api/manhia/configuracoes error", error);
    return NextResponse.json(
      { error: "Não foi possível salvar as configurações." },
      { status: 500 }
    );
  }
}