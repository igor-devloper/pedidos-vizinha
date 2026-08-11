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

function formatFulfillment(order: CartOrderWithItems) {
  if (order.fulfillmentType !== "DELIVERY") return ["Modalidade: RETIRADA"];
  return [
    "Modalidade: ENTREGA",
    `Endereço: ${order.deliveryAddress || "Não informado"}`,
    order.deliveryReference ? `Referência: ${order.deliveryReference}` : null,
    `Taxa de entrega: ${order.deliveryFeeAgreed ? formatCurrency(Number(order.deliveryFee)) : "A COMBINAR"}`,
  ].filter((line): line is string => Boolean(line));
}

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

  // O carrinho salva o horÃ¡rio local como UTC fixo para nÃ£o somar/subtrair 3h.
  // Por isso formatamos pelos campos UTC, sem conversÃ£o de fuso.
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
    `FEITO EM: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(order.createdAt)}`,
    `Nome: ${order.customerName || "NÃ£o informado"}`,
    ...formatFulfillment(order),
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
    "✅ *PEDIDO CONFIRMADO*",
    [
      `👤 *Cliente:* ${order.customerName || "Nao informado"}`,
      order.customerPhone ? `📞 *WhatsApp:* ${order.customerPhone}` : null,
      formatScheduledAt(order)
        ? `📅 *Entrega/retirada:* ${formatScheduledAt(order)}`
        : null,
      ...formatFulfillment(order).map((line) => `📍 *${line}*`),
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
      "🥰 Obrigada pela preferência!",
      `_${BUSINESS_INFO.name}_`,
    ],
  ]);
}

function buildCartOrderOwnerMessage(order: CartOrderWithItems) {
  return formatWhatsAppMessage([
    "🔔 *NOVO PEDIDO PAGO!*",
    [
      `👤 *Cliente:* ${order.customerName || "Não informado"}`,
      order.customerPhone ? `📞 *WhatsApp:* ${order.customerPhone}` : null,
      order.customerEmail ? `✉️ *E-mail:* ${order.customerEmail}` : null,
      formatScheduledAt(order)
        ? `📅 *Entrega/retirada:* ${formatScheduledAt(order)}`
        : null,
      ...formatFulfillment(order).map((line) => `📍 *${line}*`),
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

function buildCourierOrderMessage(order: CartOrderWithItems) {
  return formatWhatsAppMessage([
    "🛵 *NOVA ENTREGA AGENDADA*",
    [
      `🛍️ *Pedido #${cartOrderCode(order)}*`,
      `👤 *Cliente:* ${order.customerName || "Não informado"}`,
      order.customerPhone ? `📞 *Contato:* ${order.customerPhone}` : null,
      formatScheduledAt(order) ? `🕒 *Horário combinado:* ${formatScheduledAt(order)}` : null,
    ],
    [
      `📍 *Endereço:* ${order.deliveryAddress || "Não informado"}`,
      order.deliveryReference ? `🏠 *Referência:* ${order.deliveryReference}` : null,
      order.deliveryMapsUrl ? `🗺️ *Google Maps:* ${order.deliveryMapsUrl}` : null,
      `💵 *Taxa:* ${order.deliveryFeeAgreed ? formatCurrency(Number(order.deliveryFee)) : "a combinar"}`,
    ],
    ["📦 *Resumo:*", ...formatWhatsAppList(formatCartOrderItems(order)).map((item) => `  ${item}`)],
    "Avisaremos novamente quando o pedido estiver pronto para buscar.",
  ]);
}

function buildCourierReadyMessage(order: CartOrderWithItems) {
  return formatWhatsAppMessage([
    "✅🛵 *PEDIDO PRONTO PARA ENTREGA*",
    `O pedido *#${cartOrderCode(order)}* já pode ser buscado na ${BUSINESS_INFO.name}.`,
    [
      `👤 *Cliente:* ${order.customerName || "Não informado"}`,
      order.customerPhone ? `📞 *Contato:* ${order.customerPhone}` : null,
      formatScheduledAt(order) ? `🕒 *Entrega combinada:* ${formatScheduledAt(order)}` : null,
      `📍 *Endereço:* ${order.deliveryAddress || "Não informado"}`,
      order.deliveryReference ? `🏠 *Referência:* ${order.deliveryReference}` : null,
      order.deliveryMapsUrl ? `🗺️ *Abrir no Google Maps:* ${order.deliveryMapsUrl}` : null,
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
    | "fulfillmentType"
    | "deliveryAddress"
    | "scheduledAt"
  >,
) {
  const hasPendingBalance =
    order.paymentPercentage === 50 &&
    !order.saldoPagoAt &&
    order.saldoInitPoint &&
    order.saldoTotalCobrado !== null;

  return formatWhatsAppMessage([
    "🎉🍽️ *Seu pedido está pronto para retirada!*",
    [
      `Olá, ${order.customerName || "cliente"}! 👋`,
      `Seu pedido *#${cartOrderCode(order)}* da *${BUSINESS_INFO.name}* já está prontinho. 😍`,
      order.fulfillmentType === "DELIVERY"
        ? `🛵 Vamos enviar para ${order.deliveryAddress || "o endereço combinado"}${formatScheduledAt(order) ? ` no horário combinado de ${formatScheduledAt(order)}` : ""}.`
        : "📍 Já pode vir retirar!",
    ],
    hasPendingBalance
      ? [
        "💰 *Falta apenas o pagamento da 2ª parte*",
        `Valor restante: *${formatCurrency(Number(order.saldoTotalCobrado))}*`,
        "🔗 Pague por este link:",
        order.saldoInitPoint!,
      ]
      : null,
    "🙏 Agradecemos pela preferência e esperamos você!",
    `💬 Qualquer dúvida, fale conosco no WhatsApp: ${BUSINESS_INFO.supportPhone}`,
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
            "Envio para cliente nÃ£o confirmado pelo serviÃ§o de WhatsApp.",
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
            "Envio para Vizinha nÃ£o confirmado pelo serviÃ§o de WhatsApp.",
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

  if (order.fulfillmentType === "DELIVERY" && !order.notifiedCourierAt) {
    const settings = await prisma.storeSettings.findUnique({ where: { id: "singleton" }, select: { motorcycleCourierPhone: true } });
    if (settings?.motorcycleCourierPhone) {
      const claimedAt = new Date();
      const claim = await prisma.order.updateMany({ where: { id: order.id, notifiedCourierAt: null }, data: { notifiedCourierAt: claimedAt } });
      if (claim.count > 0) {
        try {
          const result = await sendWhatsappText(settings.motorcycleCourierPhone, buildCourierOrderMessage(order));
          if (!result.ok) throw new Error("Envio ao motoboy não confirmado.");
        } catch (error) {
          await prisma.order.updateMany({ where: { id: order.id, notifiedCourierAt: claimedAt }, data: { notifiedCourierAt: null } });
          console.error("Falha ao enviar nova entrega ao motoboy", { orderId: order.id, error });
        }
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
        { AND: [{ fulfillmentType: "DELIVERY" }, { notifiedCourierAt: null }] },
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
    throw new Error("Pedido do carrinho nÃ£o encontrado.");
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
    throw new Error("Pedido do carrinho nÃ£o encontrado.");
  }

  const enteringReady = status === "READY" && current.status !== "READY";
  const leavingReady = status !== "READY" && current.status === "READY";
  const missingReadyBalance =
    status === "READY" &&
    current.paymentPercentage === 50 &&
    !current.saldoPagoAt &&
    (!current.saldoInitPoint || !current.saldoCobrancaEnviadaAt);
  const shouldPrepareReady = enteringReady || missingReadyBalance;
  const shouldNotifyCourierReady = status === "READY" && current.fulfillmentType === "DELIVERY" && !current.notifiedCourierReadyAt;
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
      notifiedCourierReadyAt: leavingReady ? null : current.notifiedCourierReadyAt,
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
            "Envio de pronto para cliente nÃ£o confirmado pelo serviÃ§o de WhatsApp.",
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


  if (shouldNotifyCourierReady) {
    const settings = await prisma.storeSettings.findUnique({ where: { id: "singleton" }, select: { motorcycleCourierPhone: true } });
    if (settings?.motorcycleCourierPhone) {
      const claimedAt = new Date();
      const claim = await prisma.order.updateMany({ where: { id: order.id, notifiedCourierReadyAt: null }, data: { notifiedCourierReadyAt: claimedAt } });
      if (claim.count > 0) {
        try {
          const result = await sendWhatsappText(settings.motorcycleCourierPhone, buildCourierReadyMessage(order));
          if (!result.ok) throw new Error("Envio de pedido pronto ao motoboy não confirmado.");
        } catch (error) {
          await prisma.order.updateMany({ where: { id: order.id, notifiedCourierReadyAt: claimedAt }, data: { notifiedCourierReadyAt: null } });
          console.error("Falha ao avisar pedido pronto ao motoboy", { orderId: order.id, error });
        }
      }
    }
  }

  if (status === "PAID" && current.status !== "PAID") {
    return acceptPaidCartOrder(order);
  }

  return order;
}

export async function processReadyCartOrderBalanceCharges() {
  const [balanceOrders, courierOrders] = await Promise.all([
    prisma.order.findMany({
      where: { status: "READY", paymentPercentage: 50, saldoPagoAt: null, OR: [{ saldoInitPoint: null }, { saldoCobrancaEnviadaAt: null }] },
      select: { id: true }, take: 20,
    }),
    prisma.order.findMany({
      where: { status: "READY", fulfillmentType: "DELIVERY", notifiedCourierReadyAt: null },
      select: { id: true }, take: 20,
    }),
  ]);
  const orders = Array.from(new Map([...balanceOrders, ...courierOrders].map((order) => [order.id, order])).values());

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
    throw new Error("Pedido do carrinho nÃ£o encontrado.");
  }

  if (order.status === "CANCELLED") {
    throw new Error("Pedido cancelado nÃ£o pode ser confirmado.");
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "PAID",
      mercadoPagoPaymentId: `manual-cash-${order.id}`,
      provisionAmount: order.status !== "PAID"
        ? Number((Number(order.provisionAmount) + Number(order.chargedAmount) * 0.1).toFixed(2))
        : order.provisionAmount,
      provisionTransferredAt: order.status !== "PAID" ? null : order.provisionTransferredAt,
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
    fulfillmentType: order.fulfillmentType === "DELIVERY" ? "DELIVERY" as const : "PICKUP" as const,
    deliveryAddress: order.deliveryAddress,
    deliveryReference: order.deliveryReference,
    deliveryNeighborhood: order.deliveryNeighborhood,
    deliveryMapsUrl: order.deliveryMapsUrl,
    deliveryFee: Number(order.deliveryFee),
    deliveryFeeAgreed: order.deliveryFeeAgreed,
    provisionAmount: Number(order.provisionAmount),
    provisionTransferredAt: order.provisionTransferredAt?.toISOString() || null,
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
