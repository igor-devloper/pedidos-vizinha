import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { botServiceFetch } from "@/lib/bot-service";

export async function GET(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const instanceId = searchParams.get("instanceId") || "";
  const jid = searchParams.get("jid") || "";
  if (!instanceId || !jid) {
    return NextResponse.json({ error: "Informe instanceId e jid." }, { status: 400 });
  }

  try {
    const query = new URLSearchParams({ instanceId, jid });
    return NextResponse.json(
      await botServiceFetch({ path: `/conversations/log?${query.toString()}`, method: "GET" })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar a conversa.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
