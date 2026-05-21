import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { botServiceFetch } from "@/lib/bot-service";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const instance = await botServiceFetch({
      path: `/instances/${id}/start`,
      method: "POST",
      body: JSON.stringify({}),
    });

    return NextResponse.json(instance);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao iniciar instância.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
