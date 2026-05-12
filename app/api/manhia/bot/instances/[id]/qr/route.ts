import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { botServiceFetch } from "@/lib/bot-service";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const qr = await botServiceFetch({
      path: `/instances/${id}/qr`,
      method: "GET",
    });

    return NextResponse.json(qr);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao carregar QR.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
