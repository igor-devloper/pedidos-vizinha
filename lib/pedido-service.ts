import { PedidoStatus, Prisma, type Pedido, type PedidoItem } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  createMercadoPagoPreference,
  findLatestMercadoPagoPaymentByExternalReference,
} from "@/lib/mercado-pago";
import {
  buildWhatsappBalanceCardImageUrl,
  buildPrintableReceipt,
  buildWhatsappMessageForReady,
  buildWhatsappMessageForReadyWithBalance,
  buildWhatsappReadyToleranceReminder,
  buildWhatsappMessageForClient,
  buildWhatsappMessageForOwner,
  calculatePaymentAmounts,
} from "@/lib/pedidos";
import { BUSINESS_INFO, BUSINESS_RULES } from "@/lib/site-config";
import {
  getPaymentAuditEvent,
  getStatusAuditEvent,
  recordOrderEvent,
} from "@/lib/order-audit";
import { sendPedidoToPrintService } from "@/lib/print-service";
import { sendWhatsappImage, sendWhatsappText } from "@/lib/whatsapp";

type PedidoWithItens = Pedido & {
  itens: PedidoItem[];
};

type PedidoWithReadyFields = PedidoWithItens & {
  prontoAt?: Date | null;
  notificadoProntoClienteAt?: Date | null;
  notificadoToleranciaAt?: Date | null;
  saldoExternalReference?: string | null;
  saldoPreferenceId?: string | null;
  saldoInitPoint?: string | null;
  saldoTotalCobrado?: Prisma.Decimal | number | null;
  saldoPagoAt?: Date | null;
  saldoCobrancaEnviadaAt?: Date | null;
};

export class PedidoPaymentReferenceNotFoundError extends Error {
  constructor(public readonly externalReference: string) {
    super(`Pedido nÃ£o encontrado para a referÃªncia ${externalReference}.`);
    this.name = "PedidoPaymentReferenceNotFoundError";
  }
}

async function loadPedidoById(id: string) {
  return prisma.pedido.findUnique({
    where: { id },
    include: { itens: true },
  });
}

async function loadPedidoByReference(externalReference: string) {
  return prisma.pedido.findFirst({
    where: {
      OR: [
        { mpExternalReference: externalReference },
        { saldoExternalReference: externalReference } as never,
      ],
    },
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

async function notifyPedidoReady(pedido: PedidoWithReadyFields) {
  try {
    const hasPendingBalance =
      pedido.percentualPagamento === 50 &&
      !pedido.saldoPagoAt &&
      pedido.saldoInitPoint &&
      pedido.saldoTotalCobrado != null;

    if (hasPendingBalance) {
      await sendWhatsappImage({
        number: pedido.clienteTelefone,
        imageUrl: buildWhatsappBalanceCardImageUrl({
          clienteNome: pedido.clienteNome,
          codigo: pedido.codigo,
          valor: Number(pedido.saldoTotalCobrado),
          metodoPagamentoLabel: pedido.metodoPagamentoLabel,
          appUrl: BUSINESS_INFO.appUrl,
        }),
        caption: buildWhatsappMessageForReadyWithBalance({
          pedido,
          amount: Number(pedido.saldoTotalCobrado),
          paymentLabel: pedido.metodoPagamentoLabel,
          paymentUrl: pedido.saldoInitPoint!,
        }),
      });
    } else {
      await sendWhatsappText(pedido.clienteTelefone, buildWhatsappMessageForReady(pedido));
    }

    return new Date();
  } catch (error) {
    console.error("Falha ao notificar pedido pronto via WhatsApp", {
      pedidoId: pedido.id,
      codigo: pedido.codigo,
      error,
    });
    return null;
  }
}

async function ensurePedidoBalanceCharge(pedido: PedidoWithReadyFields) {
  if (pedido.percentualPagamento !== 50 || pedido.saldoPagoAt) {
    return {
      saldoExternalReference: pedido.saldoExternalReference,
      saldoPreferenceId: pedido.saldoPreferenceId,
      saldoInitPoint: pedido.saldoInitPoint,
      saldoTotalCobrado:
        pedido.saldoTotalCobrado == null ? null : Number(pedido.saldoTotalCobrado),
    };
  }

  if (pedido.saldoExternalReference && pedido.saldoPreferenceId && pedido.saldoInitPoint) {
    return {
      saldoExternalReference: pedido.saldoExternalReference,
      saldoPreferenceId: pedido.saldoPreferenceId,
      saldoInitPoint: pedido.saldoInitPoint,
      saldoTotalCobrado:
        pedido.saldoTotalCobrado == null ? null : Number(pedido.saldoTotalCobrado),
    };
  }

  const charge = calculatePaymentAmounts(
    Number(pedido.subtotal),
    50,
    pedido.metodoPagamento
  );
  const saldoExternalReference = `${pedido.mpExternalReference}-saldo`;
  const preference = await createMercadoPagoPreference({
    pedido: {
      codigo: `${pedido.codigo}-SALDO`,
      mpExternalReference: saldoExternalReference,
      produtoNomeSnapshot: `${pedido.produtoNomeSnapshot} - saldo final`,
      totalCobrado: charge.totalToCharge,
      clienteNome: pedido.clienteNome,
      clienteEmail: pedido.clienteEmail,
      clienteTelefone: pedido.clienteTelefone,
      metodoPagamento: pedido.metodoPagamento,
    },
    payer: {
      name: pedido.clienteNome,
      email: pedido.clienteEmail,
      phone: pedido.clienteTelefone,
    },
  });

  return {
    saldoExternalReference,
    saldoPreferenceId: preference.id,
    saldoInitPoint: preference.init_point,
    saldoTotalCobrado: charge.totalToCharge,
  };
}

export async function processReadyPedidoToleranceReminders(now = new Date()) {
  const toleranceThreshold = new Date(now.getTime() - BUSINESS_RULES.toleranceMinutes * 60 * 1000);
  const pedidos = (await (prisma.pedido as never as {
    findMany: (args: Prisma.PedidoFindManyArgs) => Promise<PedidoWithReadyFields[]>;
  }).findMany({
    where: {
      status: "PRONTO" as never,
      prontoAt: {
        lte: toleranceThreshold,
      },
      notificadoToleranciaAt: null,
    },
    include: {
      itens: true,
    },
  } as never)) as PedidoWithReadyFields[];

  for (const pedido of pedidos) {
    try {
      await sendWhatsappText(
        pedido.clienteTelefone,
        buildWhatsappReadyToleranceReminder(pedido)
      );

      await (prisma.pedido as never as {
        update: (args: Prisma.PedidoUpdateArgs) => Promise<Pedido>;
      }).update({
        where: { id: pedido.id },
        data: {
          notificadoToleranciaAt: new Date(),
        } as never,
      } as never);
    } catch (error) {
      console.error("Falha ao enviar lembrete de tolerancia do pedido pronto", {
        pedidoId: pedido.id,
        codigo: pedido.codigo,
        error,
      });
    }
  }
}

async function notifyPaidPedido(pedido: PedidoWithItens) {
  const clientMessage = buildWhatsappMessageForClient(pedido);
  const ownerMessage = buildWhatsappMessageForOwner(pedido);
  if (!pedido.notificadoClienteAt) {
    const claimedAt = new Date();
    const claim = await prisma.pedido.updateMany({
      where: {
        id: pedido.id,
        notificadoClienteAt: null,
      },
      data: {
        notificadoClienteAt: claimedAt,
      },
    });

    if (claim.count > 0) {
      try {
        const result = await sendWhatsappText(pedido.clienteTelefone, clientMessage);
        if (!result.ok) {
          throw new Error("Envio para cliente nÃ£o confirmado pelo serviÃ§o de WhatsApp.");
        }
      } catch (error) {
        await prisma.pedido.updateMany({
          where: {
            id: pedido.id,
            notificadoClienteAt: claimedAt,
          },
          data: {
            notificadoClienteAt: null,
          },
        });

        console.error("Falha ao notificar cliente via WhatsApp", {
          pedidoId: pedido.id,
          codigo: pedido.codigo,
          error,
        });
      }
    }
  }

  if (!pedido.notificadoVizinhaAt && BUSINESS_INFO.ownerPhone) {
    const claimedAt = new Date();
    const claim = await prisma.pedido.updateMany({
      where: {
        id: pedido.id,
        notificadoVizinhaAt: null,
      },
      data: {
        notificadoVizinhaAt: claimedAt,
      },
    });

    if (claim.count > 0) {
      try {
        const result = await sendWhatsappText(BUSINESS_INFO.ownerPhone, ownerMessage);
        if (!result.ok) {
          throw new Error("Envio para Vizinha nÃ£o confirmado pelo serviÃ§o de WhatsApp.");
        }
      } catch (error) {
        await prisma.pedido.updateMany({
          where: {
            id: pedido.id,
            notificadoVizinhaAt: claimedAt,
          },
          data: {
            notificadoVizinhaAt: null,
          },
        });

        console.error("Falha ao notificar vizinha via WhatsApp", {
          pedidoId: pedido.id,
          codigo: pedido.codigo,
          error,
        });
      }
    }
  }
}

async function printAcceptedPedido(pedido: PedidoWithItens) {
  if (pedido.impressoAutomaticamenteAt) {
    return pedido;
  }

  const claimedAt = new Date();
  const claim = await prisma.pedido.updateMany({
    where: { id: pedido.id, impressoAutomaticamenteAt: null },
    data: { impressoAutomaticamenteAt: claimedAt },
  });

  if (claim.count === 0) {
    return pedido;
  }

  try {
    await sendPedidoToPrintService(pedido, "auto-accepted");

    const printed = await prisma.pedido.findUnique({
      where: { id: pedido.id },
      include: { itens: true },
    });

    return printed || { ...pedido, impressoAutomaticamenteAt: claimedAt };
  } catch (error) {
    await prisma.pedido.updateMany({
      where: { id: pedido.id, impressoAutomaticamenteAt: claimedAt },
      data: { impressoAutomaticamenteAt: null },
    });

    console.error("Falha ao imprimir pedido aceito", {
      pedidoId: pedido.id,
      codigo: pedido.codigo,
      error,
    });
    return pedido;
  }
}

export async function processPaidPedidosSideEffects() {
  const pedidos = await prisma.pedido.findMany({
    where: {
      status: PedidoStatus.PAGO,
      OR: [
        { impressoAutomaticamenteAt: null },
        { notificadoClienteAt: null },
        { notificadoVizinhaAt: null },
      ],
    },
    include: { itens: true },
    take: 20,
  });

  for (const pedido of pedidos) {
    await notifyPaidPedido(pedido as PedidoWithItens);
    await printAcceptedPedido(pedido as PedidoWithItens);
  }
}

export async function markPedidoPaidManually({
  id,
  valorPago,
  observacao,
}: {
  id: string;
  valorPago?: number;
  observacao?: string;
}) {
  const pedidoAtual = await loadPedidoById(id);

  if (!pedidoAtual) {
    throw new Error("Pedido nÃ£o encontrado.");
  }

  const manualPayload = {
    source: "manual-payment",
    paidAt: new Date().toISOString(),
    valorPago: typeof valorPago === "number" ? valorPago : undefined,
    observacao: observacao?.trim() || undefined,
  };

  const pedido = await prisma.pedido.update({
    where: { id },
    data: {
      status: PedidoStatus.PAGO,
      valorPago:
        typeof valorPago === "number"
          ? Number(valorPago.toFixed(2))
          : Number(pedidoAtual.totalCobrado),
      mpStatus: "manual_paid",
      mpStatusDetail: observacao?.trim() || "Pagamento manual confirmado",
      mpWebhookPayload: manualPayload,
      provisionAmount: pedidoAtual.status !== PedidoStatus.PAGO
        ? Number((Number(pedidoAtual.provisionAmount) + Number(typeof valorPago === "number" ? valorPago : pedidoAtual.totalCobrado) * 0.1).toFixed(2))
        : pedidoAtual.provisionAmount,
      provisionTransferredAt: pedidoAtual.status !== PedidoStatus.PAGO ? null : pedidoAtual.provisionTransferredAt,
    } as never,
    include: { itens: true },
  } as never);

  await recordOrderEvent({
    orderId: pedido.id,
    event: "PAYMENT_APPROVED",
    source: "ADMIN",
    previousStatus: pedidoAtual.status,
    newStatus: pedido.status,
    metadata: {
      entityType: "Pedido",
      paymentKind: "MANUAL",
      hasObservation: Boolean(observacao?.trim()),
    },
  });
  if (pedido.status !== pedidoAtual.status) {
    await recordOrderEvent({
      orderId: pedido.id,
      event: getStatusAuditEvent(String(pedido.status)),
      source: "ADMIN",
      previousStatus: pedidoAtual.status,
      newStatus: pedido.status,
      metadata: { entityType: "Pedido", trigger: "MANUAL_PAYMENT" },
    });
  }

  await notifyPaidPedido(pedido as PedidoWithItens);
  return printAcceptedPedido(pedido as PedidoWithItens);
}

export async function handleMercadoPagoPaymentUpdate({
  externalReference,
  paymentId,
  merchantOrderId,
  status,
  statusDetail,
  transactionAmount,
  dateApproved,
  liveMode,
  payload,
}: {
  externalReference: string;
  paymentId: string;
  merchantOrderId?: string | number | null;
  status: string;
  statusDetail?: string;
  transactionAmount?: number;
  dateApproved?: string;
  liveMode?: boolean;
  payload?: unknown;
}) {
  const pedido = (await loadPedidoByReference(externalReference)) as PedidoWithReadyFields | null;

  if (!pedido) {
    throw new PedidoPaymentReferenceNotFoundError(externalReference);
  }

  const isBalancePayment = pedido.saldoExternalReference === externalReference;
  const expectedAmount = isBalancePayment
    ? Number(pedido.saldoTotalCobrado || 0)
    : Number(pedido.totalCobrado);
  if (status === "approved") {
    if (!dateApproved) throw new Error(`Pagamento aprovado sem data de aprovação para o pedido ${pedido.codigo}.`);
    if (process.env.NODE_ENV === "production" && liveMode !== true) {
      throw new Error(`Pagamento de teste não pode confirmar o pedido ${pedido.codigo} em produção.`);
    }
    if (typeof transactionAmount !== "number" || Math.abs(transactionAmount - expectedAmount) > 0.01) {
      throw new Error(`Valor aprovado diverge do pedido ${pedido.codigo}.`);
    }
    const alreadyApplied = isBalancePayment
      ? Boolean(pedido.saldoPagoAt)
      : pedido.status === PedidoStatus.PAGO && pedido.mpPaymentId === paymentId;
    if (alreadyApplied) return pedido;
  }
  const nextStatus =
    isBalancePayment
      ? pedido.status
      : status === "approved"
        ? PedidoStatus.PAGO
        : ["cancelled", "refunded", "charged_back"].includes(status)
          ? PedidoStatus.CANCELADO
          : pedido.status;
  const webhookPayload =
    payload === undefined
      ? pedido.mpWebhookPayload === null
        ? undefined
        : (pedido.mpWebhookPayload as Prisma.InputJsonValue)
      : (payload as Prisma.InputJsonValue);
  const shouldProvision = status === "approved" &&
    (isBalancePayment ? !pedido.saldoPagoAt : pedido.status !== PedidoStatus.PAGO);
  const paidForProvision = typeof transactionAmount === "number"
    ? transactionAmount
    : isBalancePayment
      ? Number(pedido.saldoTotalCobrado || 0)
      : Number(pedido.totalCobrado);

  const updated = await prisma.pedido.update({
    where: { id: pedido.id },
    data: {
      status: nextStatus,
      valorPago:
        typeof transactionAmount === "number"
          ? Number(
              (
                (isBalancePayment ? Number(pedido.valorPago || 0) : 0) + transactionAmount
              ).toFixed(2)
            )
          : pedido.valorPago,
      mpPaymentId: isBalancePayment ? pedido.mpPaymentId : paymentId,
      mpMerchantOrderId:
        isBalancePayment ? pedido.mpMerchantOrderId : merchantOrderId ? String(merchantOrderId) : pedido.mpMerchantOrderId,
      saldoPagoAt:
        isBalancePayment && status === "approved" ? new Date() : (pedido as PedidoWithReadyFields).saldoPagoAt,
      mpStatus: isBalancePayment ? pedido.mpStatus : status,
      mpStatusDetail: isBalancePayment ? pedido.mpStatusDetail : statusDetail || pedido.mpStatusDetail,
      mpWebhookPayload: webhookPayload,
      provisionAmount: shouldProvision
        ? Number((Number(pedido.provisionAmount) + paidForProvision * 0.1).toFixed(2))
        : pedido.provisionAmount,
      provisionTransferredAt: shouldProvision ? null : pedido.provisionTransferredAt,
    } as never,
    include: { itens: true },
  } as never);

  const paymentEvent = getPaymentAuditEvent(status);
  if (paymentEvent) {
    await recordOrderEvent({
      orderId: updated.id,
      event: paymentEvent,
      source: "MERCADO_PAGO",
      previousStatus: pedido.status,
      newStatus: updated.status,
      metadata: {
        entityType: "Pedido",
        paymentId,
        externalReference,
        paymentStatus: status,
        balance: isBalancePayment,
      },
    });
  }
  if (!isBalancePayment && updated.status !== pedido.status) {
    await recordOrderEvent({
      orderId: updated.id,
      event: getStatusAuditEvent(String(updated.status)),
      source: "MERCADO_PAGO",
      previousStatus: pedido.status,
      newStatus: updated.status,
      metadata: { entityType: "Pedido", paymentId, trigger: "PAYMENT_STATUS" },
    });
  }

  if (!isBalancePayment && status === "approved") {
    await notifyPaidPedido(updated as PedidoWithItens);
    return printAcceptedPedido(updated as PedidoWithItens);
  }

  return updated;
}

export async function syncPedidoPaymentByExternalReference(externalReference: string) {
  const pedido = await loadPedidoByReference(externalReference);

  if (!pedido) {
    throw new Error(`Pedido nÃ£o encontrado para a referÃªncia ${externalReference}.`);
  }

  if (pedido.status !== PedidoStatus.PENDENTE_PAGAMENTO) {
    return pedido;
  }

  const payment = await findLatestMercadoPagoPaymentByExternalReference(externalReference);

  if (!payment) {
    return pedido;
  }

  return handleMercadoPagoPaymentUpdate({
    externalReference,
    paymentId: String(payment.id),
    merchantOrderId: payment.order?.id,
    status: payment.status,
    statusDetail: payment.status_detail,
    transactionAmount: payment.transaction_amount,
    dateApproved: payment.date_approved,
    liveMode: payment.live_mode,
    payload: {
      source: "checkout-return-sync",
      paymentId: payment.id,
      status: payment.status,
    },
  });
}

export async function updatePedidoStatus(id: string, status: PedidoStatus) {
  const pedidoAtual = await loadPedidoById(id);

  if (!pedidoAtual) {
    throw new Error("Pedido nÃ£o encontrado.");
  }

  const pedidoAtualWithReady = pedidoAtual as PedidoWithReadyFields;
  const enteringReady =
    status === ("PRONTO" as PedidoStatus) && pedidoAtual.status !== ("PRONTO" as PedidoStatus);
  const leavingReady =
    status !== ("PRONTO" as PedidoStatus) && pedidoAtual.status === ("PRONTO" as PedidoStatus);

  const balanceCharge = enteringReady
    ? await ensurePedidoBalanceCharge(pedidoAtualWithReady)
    : null;

  const pedido = await (prisma.pedido as never as {
    update: (args: Prisma.PedidoUpdateArgs) => Promise<PedidoWithReadyFields>;
  }).update({
    where: { id },
    data: {
      status,
      prontoAt: enteringReady ? new Date() : leavingReady ? null : pedidoAtualWithReady.prontoAt,
      notificadoProntoClienteAt: enteringReady ? null : pedidoAtualWithReady.notificadoProntoClienteAt,
      notificadoToleranciaAt:
        enteringReady || leavingReady ? null : pedidoAtualWithReady.notificadoToleranciaAt,
      saldoExternalReference: balanceCharge?.saldoExternalReference ?? pedidoAtualWithReady.saldoExternalReference,
      saldoPreferenceId: balanceCharge?.saldoPreferenceId ?? pedidoAtualWithReady.saldoPreferenceId,
      saldoInitPoint: balanceCharge?.saldoInitPoint ?? pedidoAtualWithReady.saldoInitPoint,
      saldoTotalCobrado:
        balanceCharge?.saldoTotalCobrado ?? pedidoAtualWithReady.saldoTotalCobrado,
      saldoCobrancaEnviadaAt: enteringReady ? null : pedidoAtualWithReady.saldoCobrancaEnviadaAt,
    },
    include: {
      itens: true,
      produto: true,
    },
  } as never);

  if (pedido.status !== pedidoAtual.status) {
    await recordOrderEvent({
      orderId: pedido.id,
      event: getStatusAuditEvent(String(pedido.status)),
      source: "ADMIN",
      previousStatus: pedidoAtual.status,
      newStatus: pedido.status,
      metadata: { entityType: "Pedido" },
    });
  }

  if (balanceCharge) {
    await recordOrderEvent({
      orderId: pedido.id,
      event: "PAYMENT_CREATED",
      source: "SYSTEM",
      previousStatus: pedidoAtual.status,
      newStatus: pedido.status,
      metadata: {
        entityType: "Pedido",
        paymentKind: "BALANCE_PREFERENCE",
        preferenceId: balanceCharge.saldoPreferenceId,
        externalReference: balanceCharge.saldoExternalReference,
      },
    });
  }

  if (enteringReady) {
    const notifiedAt = await notifyPedidoReady(pedido as PedidoWithReadyFields);

    if (notifiedAt) {
      return (prisma.pedido as never as {
        update: (args: Prisma.PedidoUpdateArgs) => Promise<PedidoWithReadyFields>;
      }).update({
        where: { id: pedido.id },
        data: {
          notificadoProntoClienteAt: notifiedAt,
          saldoCobrancaEnviadaAt:
            pedido.percentualPagamento === 50 && !pedido.saldoPagoAt ? notifiedAt : pedido.saldoCobrancaEnviadaAt,
        } as never,
        include: {
          itens: true,
          produto: true,
        },
      } as never);
    }
  }

  if (status === PedidoStatus.PAGO && pedidoAtual.status !== PedidoStatus.PAGO) {
    await notifyPaidPedido(pedido as PedidoWithItens);
    return printAcceptedPedido(pedido as PedidoWithItens);
  }

  return pedido;
}

export async function markPedidoPrinted(id: string) {
  const pedido = await loadPedidoById(id);

  if (!pedido) {
    throw new Error("Pedido nÃ£o encontrado.");
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

export async function printPedidoReceipt(id: string) {
  const pedido = await loadPedidoById(id);

  if (!pedido) {
    throw new Error("Pedido nÃ£o encontrado.");
  }

  await sendPedidoToPrintService(pedido, "manual");

  return prisma.pedido.update({
    where: { id },
    data: {
      impressoAutomaticamenteAt: pedido.impressoAutomaticamenteAt || new Date(),
    },
    include: { itens: true },
  });
}

export async function getPedidoReceipt(id: string) {
  const pedido = await loadPedidoById(id);

  if (!pedido) {
    throw new Error("Pedido nÃ£o encontrado.");
  }

  return buildPrintableReceipt(pedido);
}

