import { NextResponse } from "next/server";
import { z } from "zod";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { botServiceFetch } from "@/lib/bot-service";

const createInstanceSchema = z.object({
  name: z.string().min(2),
  phoneNumber: z.string().optional(),
  webhookUrl: z.string().url().optional(),
});

export async function GET(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const instances = await botServiceFetch<unknown[]>({
      path: "/instances",
      method: "GET",
    });

    return NextResponse.json(instances);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao carregar instâncias.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const payload = createInstanceSchema.parse(await req.json());
    const instance = await botServiceFetch({
      path: "/instances",
      method: "POST",
      body: JSON.stringify(payload),
    });

    return NextResponse.json(instance, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Payload inválido.", details: error.flatten() },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Falha ao criar instância.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
