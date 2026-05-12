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

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const payload = flowSchema.parse(await req.json());
    const flow = await prisma.botFlow.update({
      where: { id },
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

    return NextResponse.json(flow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Payload invalido.", details: error.flatten() },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Falha ao atualizar fluxo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await prisma.botFlow.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao excluir fluxo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
