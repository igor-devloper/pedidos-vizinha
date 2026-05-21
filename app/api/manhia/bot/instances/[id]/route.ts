import { NextResponse } from "next/server";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { botServiceFetch } from "@/lib/bot-service";

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const result = await botServiceFetch({
      path: `/instances/${id}`,
      method: "DELETE",
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao excluir instância.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
