// app/api/encomendas/admin/confirmar/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  sendPedidoConfirmadoEmail,
  sendPedidoRecusadoEmail,
} from "@/lib/email/resend";

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
      console.warn("[GZAPPY] Telefone não informado, pulando envio de WhatsApp.");
      return;
    }

    const token = process.env.GZAPPY_TOKEN;
    if (!token) {
      console.error("[GZAPPY] GZAPPY_TOKEN não configurado nas variáveis de ambiente.");
      return;
    }

    // Normaliza telefone: remove tudo que não for número (ex: (84) 99999-9999 → 84999999999)
    const phone = telefone.replace(/\D/g, "");
    if (!phone) {
      console.error("[GZAPPY] Telefone inválido após normalização:", telefone);
      return;
    }

    let mensagem = "";

    if (tipo === "METADE") {
      mensagem = `
Oi, ${nome}! 😊

Recebemos o *pagamento parcial* do seu pedido *#${txid}*.
O seu pedido já está *confirmado*.

Responda essa mensgem para combinarmos sobre horário para entrega de sua encomenda. 
Lembrando que só entregamos até as 17:30h, em?😊

Qualquer dúvida, estou por aqui!

Obrigado pela confiança! 🚀✨
      `;
    }

    if (tipo === "TOTAL") {
      mensagem = `
Oi, ${nome}! 👋😊

Seu pagamento do pedido *#${txid}* foi confirmado com sucesso! 🎉

Responda essa mensgem para combinarmos sobre horário para entrega de sua encomenda. 
Lembrando que só entregamos até as 17:30h, em?😊

Qualquer dúvida, estou por aqui!

Obrigado pela confiança! 🚀✨
      `;
    }

    if (tipo === "CANCELADO") {
      mensagem = `
Oi, ${nome}. Tudo bem?

Seu pedido *#${txid}* foi *cancelado*.
${motivo ? `Motivo: ${motivo}\n` : ""}

Se precisar fazer um novo pedido ou tiver alguma dúvida, pode chamar aqui mesmo. 🙂
      `;
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
        parsedMessage:
          data?.message ??
          data?.error ??
          JSON.stringify(data),
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
      tipo, // "METADE" | "TOTAL" (quando aprovado)
      motivo,
    } = body as {
      txid: string;
      aprovado: boolean;
      tipo?: "METADE" | "TOTAL";
      motivo?: string;
    };

    if (!txid) {
      return NextResponse.json(
        { error: "txid é obrigatório." },
        { status: 400 }
      );
    }

    // CASO APROVADO (METADE ou TOTAL) → sempre confirma o pedido
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

      // WhatsApp: pagamento confirmado (metade ou total)
      await enviarWhatsappConfirmacao({
        telefone: encomenda.telefone,
        tipo: tipoWhatsapp,
        nome: encomenda.nome,
        txid: encomenda.txid,
      });

      // E-mail de confirmação (meia ou total)
      await sendPedidoConfirmadoEmail(
        {
          txid: encomenda.txid,
          nome: encomenda.nome,
          email: encomenda.email,
          totalItens: encomenda.totalItens,
          valorTotal: Number(encomenda.valorTotal),
          valorPago: encomenda.valorPago
            ? Number(encomenda.valorPago)
            : undefined,
        },
        tipo === "METADE" ? "METADE" : "TOTAL"
      );

      return NextResponse.json({ ok: true, encomenda });
    }

    // CASO REPROVAÇÃO / CANCELAMENTO
    const encomenda = await prisma.encomenda.update({
      where: { txid },
      data: { status: "CANCELADO" },
      include: { itens: true },
    });

    // WhatsApp: pedido cancelado
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
      { error: "Erro ao atualizar status da encomenda." },
      { status: 500 }
    );
  }
}
