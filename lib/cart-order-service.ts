import {
  type Order,
  type OrderItem,
  type OrderStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { createMercadoPagoPreference } from "@/lib/mercado-pago";
import { calculatePaymentAmounts, formatCurrency } from "@/lib/pedidos";
import { sendCartOrderToPrintService } from "@/lib/print-service";
import { BUSINESS_INFO } from "@/lib/site-config";
import { sendWhatsappText } from "@/lib/whatsapp";
import {
  formatWhatsAppList,
  formatWhatsAppMessage,
  WHATSAPP_SECTION_DIVIDER,
} from "@/lib/whatsapp-message";

type CartOrderWithItems = Order & {
  items: OrderItem[];
  code?: string | null;
  scheduledAt?: Date | string | null;
};

function cartOrderCode(
  order: Pick<CartOrderWithItems, "id"> & { code?: string | null },
) {
  return order.code || order.id.slice(0, 10).toUpperCase();
}

function getScheduledAtDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatScheduledAt(order: Pick<CartOrderWithItems, "scheduledAt">) {
  const date = getScheduledAtDate(order.scheduledAt);
  if (!date) return null;

  // O carrinho salva o horário local como UTC fixo para não somar/subtrair 3h.
  // Por isso formatamos pelos campos UTC, sem conversão de fuso.
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function scheduledAtToLocalIso(value: Date | string | null | undefined) {
  const date = getScheduledAtDate(value);
  if (!date) return null;

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:00`;
}

function formatCartOrderItems(order: CartOrderWithItems) {
  return order.items.flatMap((item) => {
    const selectedItems = Array.isArray(item.selectedItems)
      ? item.selectedItems
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }

            const typed = entry as { tipo?: unknown; quantidade?: unknown };
            const tipo =
              typeof typed.tipo === "string" ? typed.tipo.trim() : "";
            const quantidade = Number(typed.quantidade);

            if (!tipo || !Number.isFinite(quantidade) || quantidade <= 0) {
              return null;
            }

            return `  - ${tipo}: ${quantidade} un`;
          })
          .filter((entry): entry is string => Boolean(entry))
      : [];

    return [
      `${item.quantity}x ${item.productName} (${item.productType}) - ${formatCurrency(Number(item.subtotal))}`,
      ...selectedItems,
    ];
  });
}

export function buildCartOrderPrintableReceipt(order: CartOrderWithItems) {
  const lines = [
    `#${BUSINESS_INFO.name}`,
    `#PEDIDO CARRINHO ${cartOrderCode(order)}`,
    "-".repeat(30),
    "#CLIENTE",
    `Nome: ${order.customerName || "Nao informado"}`,
    order.customerPhone ? `WhatsApp: ${order.customerPhone}` : null,
    order.customerEmail ? `E-mail: ${order.customerEmail}` : null,
    formatScheduledAt(order)
      ? `Entrega/retirada: ${formatScheduledAt(order)}`
      : null,
    "-".repeat(30),
    "#ITENS",
    ...formatCartOrderItems(order),
    "-".repeat(30),
    "#PAGAMENTO",
    `Forma: ${order.paymentMethodLabel}`,
    `Pago agora: ${order.paymentPercentage}%`,
    `Total pedido: ${formatCurrency(Number(order.totalAmount))}`,
    `Taxa: ${formatCurrency(Number(order.feeAmount))}`,
    `COBRADO: ${formatCurrency(Number(order.chargedAmount || order.totalAmount))}`,
  ];

  return lines.filter(Boolean).join("\n");
}

function buildCartOrderClientMessage(order: CartOrderWithItems) {
  return formatWhatsAppMessage([
    "✅ *Pedido Confirmado!*",
    [
      `👤 *Cliente:* ${order.customerName || "Nao informado"}`,
      order.customerPhone ? `📞 *WhatsApp:* ${order.customerPhone}` : null,
      formatScheduledAt(order)
        ? `🗓️ *Entrega/retirada:* ${formatScheduledAt(order)}`
        : null,
    ],
    [
      WHATSAPP_SECTION_DIVIDER,
      `🛍️ *Pedido #${cartOrderCode(order)}*`,
      WHATSAPP_SECTION_DIVIDER,
    ],
    [
      "📦 *Itens:*",
      ...formatWhatsAppList(formatCartOrderItems(order)).map(
        (item) => `  ${item}`,
      ),
      `💰 *Total do pedido:* ${formatCurrency(Number(order.totalAmount))}`,
      `💳 *Pagamento:* ${order.paymentMethodLabel} (${order.paymentPercentage}% pago)`,
      `   Pago agora: ${formatCurrency(Number(order.chargedAmount || order.totalAmount))}`,
    ],
    [
      WHATSAPP_SECTION_DIVIDER,
      "Obrigada pela preferência!",
      `_${BUSINESS_INFO.name}_`,
    ],
  ]);
}

function buildCartOrderOwnerMessage(order: CartOrderWithItems) {
  return formatWhatsAppMessage([
    "🔔 *Novo Pedido Pago!*",
    [
      `👤 *Cliente:* ${order.customerName || "Nao informado"}`,
      order.customerPhone ? `📞 *WhatsApp:* ${order.customerPhone}` : null,
      order.customerEmail ? `✉️ *E-mail:* ${order.customerEmail}` : null,
      formatScheduledAt(order)
        ? `🗓️ *Entrega/retirada:* ${formatScheduledAt(order)}`
        : null,
    ],
    [
      WHATSAPP_SECTION_DIVIDER,
      `🛍️ *Pedido #${cartOrderCode(order)}*`,
      WHATSAPP_SECTION_DIVIDER,
    ],
    [
      "📦 *Itens:*",
      ...formatWhatsAppList(formatCartOrderItems(order)).map(
        (item) => `  ${item}`,
      ),
      `💰 *Total do pedido:* ${formatCurrency(Number(order.totalAmount))}`,
      `💳 *Pagamento:* ${order.paymentMethodLabel} (${order.paymentPercentage}% pago)`,
      `   Pago agora: ${formatCurrency(Number(order.chargedAmount || order.totalAmount))}`,
    ],
  ]);
}

function buildCartOrderReadyMessage(
  order: Pick<
    Order,
    | "id"
    | "customerName"
    | "paymentPercentage"
    | "saldoInitPoint"
    | "saldoTotalCobrado"
    | "saldoPagoAt"
  >,
) {
  const hasPendingBalance =
    order.paymentPercentage === 50 &&
    !order.saldoPagoAt &&
    order.saldoInitPoint &&
    order.saldoTotalCobrado !== null;

  return formatWhatsAppMessage([
    "🍽️ *Seu pedido está pronto!*",
    [
      `Oi, ${order.customerName || "cliente"}!`,
      `Seu pedido *#${cartOrderCode(order)}* da *${BUSINESS_INFO.name}* já está pronto.`,
    ],
    hasPendingBalance
      ? [
          "💰 *Falta o pagamento da 2ª parte*",
          `Valor para quitar agora: *${formatCurrency(Number(order.saldoTotalCobrado))}*`,
          "🔗 *Acesse sua cobrança para pagar:*",
          order.saldoInitPoint!,
        ]
      : null,
    `📲 Se precisar falar com a equipe, chame no WhatsApp: ${BUSINESS_INFO.supportPhone}`,
  ]);
}

async function ensureCartOrderBalanceCharge(order: CartOrderWithItems) {
  if (order.paymentPercentage !== 50 || order.saldoPagoAt) {
    return null;
  }

  if (
    order.saldoExternalReference &&
    order.saldoPreferenceId &&
    order.saldoInitPoint &&
    order.saldoTotalCobrado !== null
  ) {
    return {
      saldoExternalReference: order.saldoExternalReference,
      saldoPreferenceId: order.saldoPreferenceId,
      saldoInitPoint: order.saldoInitPoint,
      saldoTotalCobrado: Number(order.saldoTotalCobrado),
    };
  }

  const charge = calculatePaymentAmounts(
    Number(order.totalAmount),
    50,
    order.paymentMethod,
  );
  const saldoExternalReference = `${order.externalReference}-saldo`;
  const preference = await createMercadoPagoPreference({
    pedido: {
      codigo: `${cartOrderCode(order)}-SALDO`,
      mpExternalReference: saldoExternalReference,
      produtoNomeSnapshot: `Pedido ${cartOrderCode(order)} - saldo final`,
      totalCobrado: charge.totalToCharge,
      clienteNome: order.customerName || "Cliente",
      clienteEmail: order.customerEmail,
      clienteTelefone: order.customerPhone || "",
      metodoPagamento: order.paymentMethod,
    },
    payer: {
      name: order.customerName || "Cliente",
      email: order.customerEmail,
      phone: order.customerPhone,
    },
  });

  return {
    saldoExternalReference,
    saldoPreferenceId: preference.id,
    saldoInitPoint: preference.init_point,
    saldoTotalCobrado: charge.totalToCharge,
  };
}

async function loadCartOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });
}

async function notifyPaidCartOrder(order: CartOrderWithItems) {
  if (!order.notificadoClienteAt && order.customerPhone) {
    const claimedAt = new Date();
    const claim = await prisma.order.updateMany({
      where: { id: order.id, notificadoClienteAt: null },
      data: { notificadoClienteAt: claimedAt },
    });

    if (claim.count > 0) {
      try {
        const result = await sendWhatsappText(
          order.customerPhone,
          buildCartOrderClientMessage(order),
        );
        if (!result.ok) {
          throw new Error(
            "Envio para cliente nao confirmado pelo servico de WhatsApp.",
          );
        }
      } catch (error) {
        await prisma.order.updateMany({
          where: { id: order.id, notificadoClienteAt: claimedAt },
          data: { notificadoClienteAt: null },
        });
        console.error("Falha ao notificar cliente do carrinho via WhatsApp", {
          orderId: order.id,
          error,
        });
      }
    }
  }

  if (!order.notificadoVizinhaAt && BUSINESS_INFO.ownerPhone) {
    const claimedAt = new Date();
    const claim = await prisma.order.updateMany({
      where: { id: order.id, notificadoVizinhaAt: null },
      data: { notificadoVizinhaAt: claimedAt },
    });

    if (claim.count > 0) {
      try {
        const result = await sendWhatsappText(
          BUSINESS_INFO.ownerPhone,
          buildCartOrderOwnerMessage(order),
        );
        if (!result.ok) {
          throw new Error(
            "Envio para Vizinha nao confirmado pelo servico de WhatsApp.",
          );
        }
      } catch (error) {
        await prisma.order.updateMany({
          where: { id: order.id, notificadoVizinhaAt: claimedAt },
          data: { notificadoVizinhaAt: null },
        });
        console.error(
          "Falha ao notificar Vizinha sobre carrinho via WhatsApp",
          { orderId: order.id, error },
        );
      }
    }
  }
}

async function printAcceptedCartOrder(order: CartOrderWithItems) {
  if (order.impressoAutomaticamenteAt) {
    return order;
  }

  const claimedAt = new Date();
  const claim = await prisma.order.updateMany({
    where: { id: order.id, impressoAutomaticamenteAt: null },
    data: { impressoAutomaticamenteAt: claimedAt },
  });

  if (claim.count === 0) {
    return order;
  }

  try {
    await sendCartOrderToPrintService({
      orderId: order.id,
      code: cartOrderCode(order),
      reason: "auto-accepted",
      receipt: buildCartOrderPrintableReceipt(order),
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAt: scheduledAtToLocalIso(order.scheduledAt) || undefined,
      total: Number(order.chargedAmount || order.totalAmount),
    });

    const printed = await prisma.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    });

    return printed || { ...order, impressoAutomaticamenteAt: claimedAt };
  } catch (error) {
    await prisma.order.updateMany({
      where: { id: order.id, impressoAutomaticamenteAt: claimedAt },
      data: { impressoAutomaticamenteAt: null },
    });

    console.error("Falha ao imprimir pedido do carrinho aceito", {
      orderId: order.id,
      error,
    });
    return order;
  }
}

export async function acceptPaidCartOrder(order: CartOrderWithItems) {
  await notifyPaidCartOrder(order);
  return printAcceptedCartOrder(order);
}

export async function processPaidCartOrdersSideEffects() {
  const orders = await prisma.order.findMany({
    where: {
      status: "PAID",
      OR: [
        { impressoAutomaticamenteAt: null },
        { notificadoClienteAt: null },
        { notificadoVizinhaAt: null },
      ],
    },
    include: { items: true },
    take: 20,
  });

  for (const order of orders) {
    await acceptPaidCartOrder(order);
  }
}


export async function printCartOrderReceipt(id: string) {
  const order = await loadCartOrder(id);

  if (!order) {
    throw new Error("Pedido do carrinho nao encontrado.");
  }

  await sendCartOrderToPrintService({
    orderId: order.id,
    code: cartOrderCode(order),
    reason: "manual",
    receipt: buildCartOrderPrintableReceipt(order),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAt: scheduledAtToLocalIso(order.scheduledAt) || undefined,
    total: Number(order.chargedAmount || order.totalAmount),
  });

  return prisma.order.update({
    where: { id: order.id },
    data: { impressoAutomaticamenteAt: order.impressoAutomaticamenteAt || new Date() },
    include: { items: true },
  });
}

export async function updateCartOrderStatus(id: string, status: OrderStatus) {
  const current = await loadCartOrder(id);

  if (!current) {
    throw new Error("Pedido do carrinho nao encontrado.");
  }

  const enteringReady = status === "READY" && current.status !== "READY";
  const leavingReady = status !== "READY" && current.status === "READY";
  const missingReadyBalance =
    status === "READY" &&
    current.paymentPercentage === 50 &&
    !current.saldoPagoAt &&
    (!current.saldoInitPoint || !current.saldoCobrancaEnviadaAt);
  const shouldPrepareReady = enteringReady || missingReadyBalance;
  const balanceCharge = shouldPrepareReady
    ? await ensureCartOrderBalanceCharge(current)
    : null;

  const order = await prisma.order.update({
    where: { id },
    data: {
      status,
      prontoAt: enteringReady
        ? new Date()
        : leavingReady
          ? null
          : current.prontoAt,
      notificadoProntoClienteAt: shouldPrepareReady
        ? null
        : current.notificadoProntoClienteAt,
      saldoExternalReference:
        balanceCharge?.saldoExternalReference ?? current.saldoExternalReference,
      saldoPreferenceId:
        balanceCharge?.saldoPreferenceId ?? current.saldoPreferenceId,
      saldoInitPoint: balanceCharge?.saldoInitPoint ?? current.saldoInitPoint,
      saldoTotalCobrado:
        balanceCharge?.saldoTotalCobrado ?? current.saldoTotalCobrado,
      saldoCobrancaEnviadaAt: shouldPrepareReady
        ? null
        : current.saldoCobrancaEnviadaAt,
    },
    include: { items: true },
  });

  if (shouldPrepareReady && order.customerPhone) {
    const claimedAt = new Date();
    const claim = await prisma.order.updateMany({
      where: { id: order.id, notificadoProntoClienteAt: null },
      data: { notificadoProntoClienteAt: claimedAt },
    });

    if (claim.count > 0) {
      try {
        const result = await sendWhatsappText(
          order.customerPhone,
          buildCartOrderReadyMessage(order),
        );
        if (!result.ok) {
          throw new Error(
            "Envio de pronto para cliente nao confirmado pelo servico de WhatsApp.",
          );
        }
        if (order.paymentPercentage === 50 && !order.saldoPagoAt) {
          await prisma.order.update({
            where: { id: order.id },
            data: { saldoCobrancaEnviadaAt: claimedAt },
          });
        }
      } catch (error) {
        await prisma.order.updateMany({
          where: { id: order.id, notificadoProntoClienteAt: claimedAt },
          data: { notificadoProntoClienteAt: null },
        });
        console.error("Falha ao notificar pedido do carrinho pronto", {
          orderId: order.id,
          error,
        });
      }
    }
  }

  if (status === "PAID" && current.status !== "PAID") {
    return acceptPaidCartOrder(order);
  }

  return order;
}

export async function processReadyCartOrderBalanceCharges() {
  const orders = await prisma.order.findMany({
    where: {
      status: "READY",
      paymentPercentage: 50,
      saldoPagoAt: null,
      OR: [
        { saldoInitPoint: null },
        { saldoCobrancaEnviadaAt: null },
      ],
    },
    select: { id: true },
    take: 20,
  });

  for (const order of orders) {
    try {
      await updateCartOrderStatus(order.id, "READY");
    } catch (error) {
      console.error("Falha ao processar cobranca de saldo do carrinho", {
        orderId: order.id,
        error,
      });
    }
  }
}

export async function markCartOrderPaidManually({
  id,
}: {
  id: string;
  valorPago?: number;
  observacao?: string;
}) {
  const order = await loadCartOrder(id);

  if (!order) {
    throw new Error("Pedido do carrinho nao encontrado.");
  }

  if (order.status === "CANCELLED") {
    throw new Error("Pedido cancelado nao pode ser confirmado.");
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "PAID",
      mercadoPagoPaymentId: `manual-cash-${order.id}`,
    },
    include: { items: true },
  });

  if (order.cartId) {
    await prisma.cartItem.deleteMany({ where: { cartId: order.cartId } });
  }

  return acceptPaidCartOrder(updated);
}

export type SerializedCartOrderAdmin = ReturnType<
  typeof serializeCartOrderForAdmin
>;

export function serializeCartOrderForAdmin(order: CartOrderWithItems) {
  return {
    id: order.id,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    code: cartOrderCode(order),
    scheduledAt: scheduledAtToLocalIso(order.scheduledAt),
    totalAmount: Number(order.totalAmount),
    paymentPercentage: order.paymentPercentage,
    paymentMethodLabel: order.paymentMethodLabel,
    chargedAmount: Number(order.chargedAmount),
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      productType: item.productType,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
      selectedItems: item.selectedItems,
    })),
  };
}
