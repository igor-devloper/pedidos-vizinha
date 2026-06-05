import { PedidoStatus, Prisma, type Pedido, type PedidoItem } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  buildPrintableReceipt,
  buildWhatsappMessageForClient,
  buildWhatsappMessageForOwner,
} from "@/lib/pedidos";
import { BUSINESS_INFO } from "@/lib/site-config";
import { sendWhatsappText } from "@/lib/whatsapp";

type PedidoWithItens = Pedido & {
  itens: PedidoItem[];
};

async function loadPedidoById(id: string) {
  return prisma.pedido.findUnique({
    where: { id },
    include: { itens: true },
  });
}

async function loadPedidoByReference(externalReference: string) {
  return prisma.pedido.findUnique({
    where: { mpExternalReference: externalReference },
    include: { itens: true },
  });
}

export async function getPedidoForView(idOrCode: string) {
  return prisma.pedido.findFirst({
    where: {
      OR: [{ codigo: idOrCode }, { mpExternalReference: idOrCode }],
    },
    include: {
      itens: true,
      produto: true,
    },
  });
}

async function notifyPaidPedido(pedido: PedidoWithItens) {
  const clientMessage = buildWhatsappMessageForClient(pedido);
  const ownerMessage = buildWhatsappMessageForOwner(pedido);

  let notificadoClienteAt = pedido.notificadoClienteAt;
  let notificadoVizinhaAt = pedido.notificadoVizinhaAt;

  if (!pedido.notificadoClienteAt) {
    try {
      await sendWhatsappText(pedido.clienteTelefone, clientMessage);
      notificadoClienteAt = new Date();
    } catch (error) {
      console.error("Falha ao notificar cliente via WhatsApp", {
        pedidoId: pedido.id,
        codigo: pedido.codigo,
        error,
      });
    }
  }

  if (!pedido.notificadoVizinhaAt && BUSINESS_INFO.ownerPhone) {
    try {
      await sendWhatsappText(BUSINESS_INFO.ownerPhone, ownerMessage);
      notificadoVizinhaAt = new Date();
    } catch (error) {
      console.error("Falha ao notificar vizinha via WhatsApp", {
        pedidoId: pedido.id,
        codigo: pedido.codigo,
        error,
      });
    }
  }

  if (notificadoClienteAt || notificadoVizinhaAt) {
    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        notificadoClienteAt,
        notificadoVizinhaAt,
      },
    });
  }
}

export async function handleMercadoPagoPaymentUpdate({
  externalReference,
  paymentId,
  merchantOrderId,
  status,
  statusDetail,
  transactionAmount,
  payload,
}: {
  externalReference: string;
  paymentId: string;
  merchantOrderId?: string | number | null;
  status: string;
  statusDetail?: string;
  transactionAmount?: number;
  payload?: unknown;
}) {
  const pedido = await loadPedidoByReference(externalReference);

  if (!pedido) {
    throw new Error(`Pedido não encontrado para a referência ${externalReference}.`);
  }

  const nextStatus =
    status === "approved"
      ? PedidoStatus.PAGO
      : ["cancelled", "rejected", "refunded", "charged_back"].includes(status)
        ? PedidoStatus.CANCELADO
        : pedido.status;
  const webhookPayload =
    payload === undefined
      ? pedido.mpWebhookPayload === null
        ? undefined
        : (pedido.mpWebhookPayload as Prisma.InputJsonValue)
      : (payload as Prisma.InputJsonValue);

  const updated = await prisma.pedido.update({
    where: { id: pedido.id },
    data: {
      status: nextStatus,
      valorPago:
        typeof transactionAmount === "number"
          ? Number(transactionAmount.toFixed(2))
          : pedido.valorPago,
      mpPaymentId: paymentId,
      mpMerchantOrderId: merchantOrderId ? String(merchantOrderId) : pedido.mpMerchantOrderId,
      mpStatus: status,
      mpStatusDetail: statusDetail || pedido.mpStatusDetail,
      mpWebhookPayload: webhookPayload,
    },
    include: { itens: true },
  });

  if (status === "approved") {
    await notifyPaidPedido(updated);
  }

  return updated;
}

export async function updatePedidoStatus(id: string, status: PedidoStatus) {
  return prisma.pedido.update({
    where: { id },
    data: { status },
    include: {
      itens: true,
      produto: true,
    },
  });
}

export async function markPedidoPrinted(id: string) {
  const pedido = await loadPedidoById(id);

  if (!pedido) {
    throw new Error("Pedido não encontrado.");
  }

  if (pedido.impressoAutomaticamenteAt) {
    return pedido;
  }

  return prisma.pedido.update({
    where: { id },
    data: {
      impressoAutomaticamenteAt: new Date(),
    },
    include: { itens: true },
  });
}

export async function getPedidoReceipt(id: string) {
  const pedido = await loadPedidoById(id);

  if (!pedido) {
    throw new Error("Pedido não encontrado.");
  }

  return buildPrintableReceipt(pedido);
}
