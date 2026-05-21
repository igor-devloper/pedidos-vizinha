import { NextResponse } from "next/server";
import { z } from "zod";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

const flowSchema = z.object({
  nome: z.string().min(2),
  descricao: z.string().optional(),
  instanceId: z.string().optional(),
  gatilho: z.string().min(1),
  resposta: z.string().min(1),
  ativo: z.boolean().optional(),
  prioridade: z.number().int().min(0).optional(),
});

export async function GET(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const flows = await prisma.botFlow.findMany({
      orderBy: [{ prioridade: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(flows);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao carregar fluxos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const payload = flowSchema.parse(await req.json());
    const flow = await prisma.botFlow.create({
      data: {
        nome: payload.nome,
        descricao: payload.descricao || null,
        instanceId: payload.instanceId || null,
        gatilho: payload.gatilho,
        resposta: payload.resposta,
        ativo: payload.ativo ?? true,
        prioridade: payload.prioridade ?? 0,
      },
    });

    return NextResponse.json(flow, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Payload inválido.", details: error.flatten() },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Falha ao criar fluxo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
