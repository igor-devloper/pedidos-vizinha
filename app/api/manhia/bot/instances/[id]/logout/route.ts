import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { botServiceFetch } from "@/lib/bot-service";

// Desconecta o WhatsApp de verdade (desvincula o aparelho). Exige ler um QR novo depois.
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const result = await botServiceFetch<{ instance?: unknown }>({
      path: `/instances/${id}/logout`,
      method: "POST",
      body: JSON.stringify({}),
    });

    return NextResponse.json(result.instance ?? result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao desconectar o WhatsApp.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
