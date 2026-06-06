import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  sendPedidoConfirmadoEmail,
  sendPedidoRecusadoEmail,
} from "@/lib/email/resend";
import { formatWhatsAppMessage } from "@/lib/whatsapp-message";

type TipoWhatsapp = "METADE" | "TOTAL" | "CANCELADO";

async function enviarWhatsappConfirmacao({
  telefone,
  tipo,
  nome,
  txid,
  motivo,
}: {
  telefone: string | null;
  tipo: TipoWhatsapp;
  nome: string;
  txid: string;
  motivo?: string;
}) {
  try {
    if (!telefone) {
      console.warn("[GZAPPY] Telefone nao informado, envio de WhatsApp ignorado.");
      return;
    }

    const token = process.env.GZAPPY_TOKEN;
    if (!token) {
      console.error("[GZAPPY] GZAPPY_TOKEN nao configurado nas variaveis de ambiente.");
      return;
    }

    const phone = telefone.replace(/\D/g, "");
    if (!phone) {
      console.error("[GZAPPY] Telefone invalido apos a normalizacao:", telefone);
      return;
    }

    let mensagem = "";

    if (tipo === "METADE") {
      mensagem = formatWhatsAppMessage([
        "✅ *Pagamento parcial confirmado!*",
        [
          `👋 Oi, ${nome}!`,
          `Recebemos o pagamento parcial do seu pedido *#${txid}*.`,
          "Seu pedido já está *confirmado*.",
        ],
        [
          "⏰ Se precisar ajustar o horário combinado, responda esta mensagem por aqui.",
          "A tolerância de atraso é de 15 minutos para ambas as partes.",
        ],
        "Obrigada pela confiança! 🥰",
      ]);
    }

    if (tipo === "TOTAL") {
      mensagem = formatWhatsAppMessage([
        "✅ *Pagamento confirmado!*",
        [
          `👋 Oi, ${nome}!`,
          `Seu pagamento do pedido *#${txid}* foi confirmado com sucesso.`,
        ],
        [
          "⏰ Se precisar ajustar o horário combinado, responda esta mensagem por aqui.",
          "A tolerância de atraso é de 15 minutos para ambas as partes.",
        ],
        "Obrigada pela confiança! 🥰",
      ]);
    }

    if (tipo === "CANCELADO") {
      mensagem = formatWhatsAppMessage([
        "❌ *Pedido cancelado*",
        [`👋 Oi, ${nome}.`, `Seu pedido *#${txid}* foi cancelado.`],
        motivo ? `📝 *Motivo:* ${motivo}` : null,
        "Se quiser fazer um novo pedido ou tiver alguma dúvida, pode me chamar por aqui. 🙂",
      ]);
    }

    const response = await fetch("https://v2-api.gzappy.com/message/send-text", {
      method: "POST",
      headers: {
        Authorization: `${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone,
        message: mensagem.trim(),
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("[GZAPPY] Erro na resposta:", {
        status: response.status,
        statusText: response.statusText,
        rawBody: data,
        parsedMessage: data?.message ?? data?.error ?? JSON.stringify(data),
      });
      return;
    }

    console.log("[GZAPPY] Mensagem enviada com sucesso:", data);
  } catch (error) {
    console.error("[GZAPPY] Erro ao enviar mensagem:", error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      txid,
      aprovado,
      tipo,
      motivo,
    } = body as {
      txid: string;
      aprovado: boolean;
      tipo?: "METADE" | "TOTAL";
      motivo?: string;
    };

    if (!txid) {
      return NextResponse.json({ error: "O txid e obrigatorio." }, { status: 400 });
    }

    if (aprovado) {
      let status: "PAGO_METADE" | "CONFIRMADO" = "CONFIRMADO";
      let tipoWhatsapp: TipoWhatsapp = "TOTAL";

      if (tipo === "METADE") {
        status = "PAGO_METADE";
        tipoWhatsapp = "METADE";
      }

      const encomenda = await prisma.encomenda.update({
        where: { txid },
        data: { status },
        include: { itens: true },
      });

      await enviarWhatsappConfirmacao({
        telefone: encomenda.telefone,
        tipo: tipoWhatsapp,
        nome: encomenda.nome,
        txid: encomenda.txid,
      });

      await sendPedidoConfirmadoEmail(
        {
          txid: encomenda.txid,
          nome: encomenda.nome,
          email: encomenda.email,
          totalItens: encomenda.totalItens,
          valorTotal: Number(encomenda.valorTotal),
          valorPago: encomenda.valorPago ? Number(encomenda.valorPago) : undefined,
        },
        tipo === "METADE" ? "METADE" : "TOTAL"
      );

      return NextResponse.json({ ok: true, encomenda });
    }

    const encomenda = await prisma.encomenda.update({
      where: { txid },
      data: { status: "CANCELADO" },
      include: { itens: true },
    });

    await enviarWhatsappConfirmacao({
      telefone: encomenda.telefone,
      tipo: "CANCELADO",
      nome: encomenda.nome,
      txid: encomenda.txid,
      motivo,
    });

    await sendPedidoRecusadoEmail(
      {
        txid: encomenda.txid,
        nome: encomenda.nome,
        email: encomenda.email,
      },
      motivo
    );

    return NextResponse.json({ ok: true, encomenda });
  } catch (err: unknown) {
    console.error("ADMIN_CONFIRMAR_ERROR", err);
    return NextResponse.json(
      { error: "Erro ao atualizar o status da encomenda." },
      { status: 500 }
    );
  }
}
