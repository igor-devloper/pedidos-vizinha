import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { botServiceFetch } from "@/lib/bot-service";

export async function GET(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    return NextResponse.json(await botServiceFetch({ path: "/conversations", method: "GET" }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar conversas.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
