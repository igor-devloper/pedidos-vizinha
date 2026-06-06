import { NextResponse } from "next/server";
import { z } from "zod";

import { isManhiaRequestAuthenticated } from "@/lib/admin-auth";
import { sendWhatsappText } from "@/lib/whatsapp";
import { formatWhatsAppText } from "@/lib/whatsapp-message";

const bodySchema = z.object({
  number: z.string().min(8),
  text: z.string().min(1),
});

export async function POST(req: Request) {
  if (!isManhiaRequestAuthenticated(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const body = bodySchema.parse(await req.json());
    const result = await sendWhatsappText(body.number, formatWhatsAppText(body.text));
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("POST /api/notificacoes/whatsapp error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao enviar WhatsApp." },
      { status: 400 }
    );
  }
}
