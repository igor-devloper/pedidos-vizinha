import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { botServiceFetch } from "@/lib/bot-service";

export async function POST(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const body = await req.json();
    return NextResponse.json(
      await botServiceFetch({ path: "/conversations/pause", method: "POST", body: JSON.stringify(body) })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao executar a ação.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
