import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import {
  DEFAULT_OPERATION_SCHEDULE,
  normalizeOperationSchedule,
  type BusinessScheduleByWeekday,
} from "@/lib/site-config";
import { normalizeStoreSiteTheme, type StoreSiteTheme } from "@/lib/site-theme";

export async function GET(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const settings = await prisma.storeSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: {
        id: "singleton",
        isOpen: true,
        minimumLeadHours: 2,
        allowMultipleOrdersPerSlot: false,
        operationSchedule: DEFAULT_OPERATION_SCHEDULE,
        siteTheme: "COPA",
      },
    });

    return NextResponse.json({
      ...settings,
      operationSchedule: normalizeOperationSchedule(settings.operationSchedule),
    });
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
      allowMultipleOrdersPerSlot?: boolean;
      operationSchedule?: unknown;
      siteTheme?: StoreSiteTheme;
      featuredProductId?: string | null;
    } | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }

    const patch: {
      isOpen?: boolean;
      minimumLeadHours?: number;
      allowMultipleOrdersPerSlot?: boolean;
      operationSchedule?: BusinessScheduleByWeekday;
      siteTheme?: StoreSiteTheme;
      featuredProductId?: string | null;
    } = {};

    if (typeof body.isOpen === "boolean") {
      patch.isOpen = body.isOpen;
    }

    if (typeof body.minimumLeadHours === "number" && body.minimumLeadHours >= 0) {
      patch.minimumLeadHours = Math.round(body.minimumLeadHours);
    }

    if (typeof body.allowMultipleOrdersPerSlot === "boolean") {
      patch.allowMultipleOrdersPerSlot = body.allowMultipleOrdersPerSlot;
    }

    if (body.operationSchedule !== undefined) {
      patch.operationSchedule = normalizeOperationSchedule(body.operationSchedule);
    }

    if (typeof body.siteTheme === "string") {
      patch.siteTheme = normalizeStoreSiteTheme(body.siteTheme);
    }

    if (typeof body.featuredProductId === "string") {
      patch.featuredProductId = body.featuredProductId.trim() || null;
    } else if (body.featuredProductId === null) {
      patch.featuredProductId = null;
    }

    const settings = await prisma.storeSettings.upsert({
      where: { id: "singleton" },
      update: patch,
      create: {
        id: "singleton",
        isOpen: patch.isOpen ?? true,
        minimumLeadHours: patch.minimumLeadHours ?? 2,
        allowMultipleOrdersPerSlot: patch.allowMultipleOrdersPerSlot ?? false,
        operationSchedule: patch.operationSchedule ?? DEFAULT_OPERATION_SCHEDULE,
        siteTheme: patch.siteTheme ?? "COPA",
        featuredProductId: patch.featuredProductId ?? null,
      },
    });

    return NextResponse.json({
      ...settings,
      operationSchedule: normalizeOperationSchedule(settings.operationSchedule),
    });
  } catch (error) {
    console.error("PATCH /api/manhia/configuracoes error", error);
    return NextResponse.json(
      { error: "Não foi possível salvar as configurações." },
      { status: 500 }
    );
  }
}
