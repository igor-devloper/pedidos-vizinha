import { createHash } from "crypto";

import { MetodoPagamento, PedidoStatus, type Pedido, type PedidoItem, type Produto } from "@prisma/client";
import { z } from "zod";

import { getBusinessHoursStatus, getBusinessTimeParts, getBusinessWeekday } from "@/lib/business-hours";
import { getProdutoComboItens, isComboProduto } from "@/lib/produtos";
import {
  BUSINESS_INFO,
  BUSINESS_RULES,
  DEFAULT_OPERATION_SCHEDULE,
  getScheduleForWeekday,
  normalizeOperationSchedule,
  PEDIDO_STATUS_META,
  SUPPORTED_PAYMENT_METHODS,
} from "@/lib/site-config";
import {
  formatWhatsAppList,
  formatWhatsAppMessage,
  WHATSAPP_SECTION_DIVIDER,
} from "@/lib/whatsapp-message";

const BUSINESS_UTC_OFFSET = "-03:00";

export const pedidoItemSchema = z.object({
  tipo: z.string().trim().min(1, "Informe o tipo de salgado."),
  quantidade: z.coerce.number().int().positive("A quantidade precisa ser maior que zero."),
});

export const createPedidoSchema = z.object({
  produtoId: z.string().trim().min(1),
  productQuantity: z.coerce.number().int().positive("Informe uma quantidade válida do produto.").default(1),
  clienteNome: z.string().trim().min(2, "Informe o nome do cliente."),
  clienteTelefone: z.string().trim().min(10, "Informe um telefone válido."),
  clienteEmail: z.string().trim().email("Informe um e-mail válido.").optional().or(z.literal("")),
  observacoes: z.string().trim().max(500).optional().or(z.literal("")),
  dataEntrega: z.string().trim().min(1, "Escolha a data e hora de entrega."),
  percentualPagamento: z.union([z.literal(50), z.literal(100)]),
  metodoPagamento: z.nativeEnum(MetodoPagamento),
  cupomCodigo: z.string().trim().max(40).optional().or(z.literal("")),
  itens: z.array(pedidoItemSchema).min(1, "Escolha ao menos um tipo de salgado."),
});

export type CreatePedidoInput = z.infer<typeof createPedidoSchema>;

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function createPedidoCode() {
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return createHash("sha1").update(seed).digest("hex").slice(0, 10).toUpperCase();
}

export function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function getPaymentMethodConfig(method: MetodoPagamento) {
  return SUPPORTED_PAYMENT_METHODS.find((item) => item.id === method);
}

export function getPedidoStatusMeta(status: PedidoStatus | "PRONTO") {
  return PEDIDO_STATUS_META[status];
}

export function calculatePaymentAmounts(subtotal: number, paymentPercentage: 50 | 100, method: MetodoPagamento) {
  const methodConfig = getPaymentMethodConfig(method);

  if (!methodConfig) {
    throw new Error("Método de pagamento não suportado.");
  }

  const baseAmount = Number(((subtotal * paymentPercentage) / 100).toFixed(2));
  const feeAmount = Number(((baseAmount * methodConfig.feePercent) / 100).toFixed(2));
  const totalToCharge = Number((baseAmount + feeAmount).toFixed(2));

  return {
    baseAmount,
    feeAmount,
    totalToCharge,
    feePercent: methodConfig.feePercent,
    methodLabel: methodConfig.label,
  };
}

export function parseDeliveryDate(input: string) {
  const trimmed = input.trim();
  const hasExplicitZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(trimmed);
  const date = new Date(hasExplicitZone ? trimmed : `${trimmed}${BUSINESS_UTC_OFFSET}`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Data de entrega invalida.");
  }

  return date;
}

export function validateDeliveryDate(
  input: Date,
  now = new Date(),
  minimumLeadHours: number = BUSINESS_RULES.minimumLeadHours,
  options: { enforceBusinessHours?: boolean; operationSchedule?: unknown } = {}
) {
  const minDate = new Date(now.getTime() + minimumLeadHours * 60 * 60 * 1000);
  const enforceBusinessHours = options.enforceBusinessHours ?? true;
  const operationSchedule = normalizeOperationSchedule(
    options.operationSchedule ?? DEFAULT_OPERATION_SCHEDULE,
  );
  const { isOpen: isWithinSchedule } = getBusinessHoursStatus(input, operationSchedule);
  const weekday = getBusinessWeekday(input);
  const { hour, minute: minutes } = getBusinessTimeParts(input);
  const schedule = getScheduleForWeekday(operationSchedule, weekday);

  if (input.getTime() < minDate.getTime()) {
    throw new Error(`Escolha um horário com pelo menos ${minimumLeadHours} horas de antecedência.`);
  }

  if (!enforceBusinessHours) {
    if (minutes % BUSINESS_RULES.slotMinutes !== 0) {
      throw new Error(`Escolha um horário em intervalos de ${BUSINESS_RULES.slotMinutes} minutos.`);
    }

    return;
  }

  if (!schedule) {
    throw new Error("Não atendemos nessa data. Escolha um dia com horário ativo na operação.");
  }

  if (!isWithinSchedule && (hour < schedule.openHour || hour > schedule.closeHour)) {
    throw new Error(`Nesse dia, os pedidos precisam ficar entre ${schedule.openHour}h e ${schedule.closeHour}h.`);
  }

  if (hour === schedule.closeHour && minutes > 0) {
    throw new Error(`O último horário disponível nesse dia é às ${schedule.closeHour}h.`);
  }

  if (minutes % BUSINESS_RULES.slotMinutes !== 0) {
    throw new Error(`Escolha um horário em intervalos de ${BUSINESS_RULES.slotMinutes} minutos.`);
  }
}

export function normalizePedidoItems(items: CreatePedidoInput["itens"]) {
  return items
    .map((item) => ({
      tipo: item.tipo.trim(),
      quantidade: Number(item.quantidade),
    }))
    .filter((item) => item.tipo && item.quantidade > 0);
}

export function validatePedidoAgainstProduto(
  produto: Produto & { comboItens?: unknown; categoria?: string },
  items: ReturnType<typeof normalizePedidoItems>,
  productQuantity = 1
) {
  if (isComboProduto(produto)) {
    const comboItens = getProdutoComboItens(produto);

    if (items.length !== comboItens.length) {
      throw new Error("Esse combo possui itens fixos e não pode ser alterado.");
    }

    for (const comboItem of comboItens) {
      const item = items.find(
        (entry) => entry.tipo.trim().toLowerCase() === comboItem.nome.trim().toLowerCase()
      );

      if (!item || item.quantidade !== comboItem.quantidade) {
        throw new Error("Esse combo possui quantidades fixas e não pode ser alterado.");
      }
    }
  }

  const totalUnidades = items.reduce((sum, item) => sum + item.quantidade, 0);
  const totalTipos = items.length;

  const requiredUnits = produto.totalUnidades * productQuantity;
  const maxAllowedTypes = produto.maxTiposSalgado * productQuantity;

  if (totalUnidades !== requiredUnits) {
    throw new Error(`Esse produto exige exatamente ${requiredUnits} unidades.`);
  }

  if (totalTipos > maxAllowedTypes) {
    throw new Error(`Esse produto permite no máximo ${maxAllowedTypes} tipos diferentes.`);
  }

  return { totalUnidades, totalTipos };
}

type PedidoSummaryShape = Pick<
  Pedido,
  | "codigo"
  | "clienteNome"
  | "clienteTelefone"
  | "clienteEmail"
  | "dataEntrega"
  | "metodoPagamentoLabel"
  | "subtotal"
  | "taxaValor"
  | "totalCobrado"
  | "descontoPercentual"
  | "descontoValor"
  | "cupomCodigoSnapshot"
  | "cupomDivulgadorSnapshot"
  | "percentualPagamento"
  | "observacoes"
  | "produtoNomeSnapshot"
  | "status"
  | "createdAt"
> & {
  itens: Pick<PedidoItem, "tipo" | "quantidade">[];
  raffleEntry?: { code: string } | null;
};

function calculatePedidoPaymentSummary(pedido: PedidoSummaryShape) {
  const subtotal = Number(pedido.subtotal);
  const paidBase = Number(((subtotal * pedido.percentualPagamento) / 100).toFixed(2));
  const paidNow = Number(pedido.totalCobrado);
  const remaining = Number(Math.max(subtotal - paidBase, 0).toFixed(2));

  return {
    subtotal,
    paidBase,
    paidNow,
    remaining,
  };
}

export function buildPedidoSummary(pedido: PedidoSummaryShape) {
  const composition = formatWhatsAppList(
    pedido.itens.map((item) => `${item.tipo} — ${item.quantidade} un`)
  );
  const payment = calculatePedidoPaymentSummary(pedido);

  return formatWhatsAppMessage([
    [`🛍️ *Pedido #${pedido.codigo}*`, `👤 *Cliente:* ${pedido.clienteNome}`],
    [
      `📦 *Produto:* ${pedido.produtoNomeSnapshot}`,
      "🧆 *Composição:*",
      ...composition.map((item) => `  ${item}`),
    ],
    [
      `📅 *Entrega:* ${formatDateTime(pedido.dataEntrega)}`,
      `💰 *Total do pedido:* ${formatCurrency(payment.subtotal)}`,
      `💳 *Pagamento:* ${pedido.metodoPagamentoLabel} (${pedido.percentualPagamento}% agora)`,
      `   Pago agora: ${formatCurrency(payment.paidNow)}`,
      payment.remaining > 0 ? `   Restante: ${formatCurrency(payment.remaining)}` : "   Restante: R$ 0,00",
    ],
    pedido.observacoes ? `📝 *Observações:* ${pedido.observacoes}` : null,
  ]);
}

// Mantido temporariamente como referencia do layout anterior.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildWhatsappMessageForClientLegacy(pedido: PedidoSummaryShape) {
  const composition = formatWhatsAppList(
    pedido.itens.map((item) => `${item.tipo} — ${item.quantidade} un`)
  );
  const payment = calculatePedidoPaymentSummary(pedido);

  return formatWhatsAppMessage([
    "✅ *Pedido Confirmado!*",
    [`👤 *Cliente:* ${pedido.clienteNome}`, `📞 *WhatsApp:* ${pedido.clienteTelefone}`],
    [WHATSAPP_SECTION_DIVIDER, `🛍️ *Pedido #${pedido.codigo}*`, WHATSAPP_SECTION_DIVIDER],
    [
      `📦 *Produto:* ${pedido.produtoNomeSnapshot}`,
      "🧆 *Composição:*",
      ...composition.map((item) => `  ${item}`),
      `📅 *Entrega:* ${formatDateTime(pedido.dataEntrega)}`,
      `💰 *Total do pedido:* ${formatCurrency(payment.subtotal)}`,
      `💳 *Pagamento:* ${pedido.metodoPagamentoLabel} (${pedido.percentualPagamento}% pago)`,
      `   Pago agora: ${formatCurrency(payment.paidNow)}`,
      payment.remaining > 0 ? `   Restante: ${formatCurrency(payment.remaining)}` : "   Restante: R$ 0,00",
    ],
    pedido.observacoes ? `📝 *Observações:* ${pedido.observacoes}` : null,
    pedido.raffleEntry
      ? [
          "🎁 *Sorteio de Dia dos Pais*",
          "Seu pagamento confirmou sua participação!",
          `Seu código da sorte: *${pedido.raffleEntry.code}*`,
        ]
      : null,
    [
      WHATSAPP_SECTION_DIVIDER,
      `⏰ Tolerância combinada: ${BUSINESS_RULES.toleranceMinutes} minutos.`,
      "Obrigada pela preferência! 🥰",
      `_${BUSINESS_INFO.name}_`,
    ],
  ]);
}

export function buildWhatsappMessageForClient(pedido: PedidoSummaryShape) {
  const composition = formatWhatsAppList(
    pedido.itens.map((item) => `${item.tipo} - ${item.quantidade} un`),
  );
  const payment = calculatePedidoPaymentSummary(pedido);

  return formatWhatsAppMessage([
    "✅ *PEDIDO CONFIRMADO*",
    [
      `👤 *Cliente:* ${pedido.clienteNome}`,
      `📞 *WhatsApp:* ${pedido.clienteTelefone}`,
    ],
    [
      WHATSAPP_SECTION_DIVIDER,
      `🛍️ *Pedido #${pedido.codigo}*`,
      WHATSAPP_SECTION_DIVIDER,
    ],
    [
      `📦 *Produto:* ${pedido.produtoNomeSnapshot}`,
      "🧆 *Composicao:*",
      ...composition.map((item) => `  ${item}`),
      `📅 *Entrega:* ${formatDateTime(pedido.dataEntrega)}`,
      `💰 *Total do pedido:* ${formatCurrency(payment.subtotal)}`,
      `💳 *Pagamento:* ${pedido.metodoPagamentoLabel} (${pedido.percentualPagamento}% pago)`,
      `   Pago agora: ${formatCurrency(payment.paidNow)}`,
      payment.remaining > 0
        ? `   Restante: ${formatCurrency(payment.remaining)}`
        : "   Restante: R$ 0,00",
    ],
    pedido.observacoes ? `*Observacoes:* ${pedido.observacoes}` : null,
    [
      WHATSAPP_SECTION_DIVIDER,
      `⏰ Tolerancia combinada: ${BUSINESS_RULES.toleranceMinutes} minutos.`,
      "🥰 Obrigada pela preferencia!",
      `_${BUSINESS_INFO.name}_`,
    ],
  ]);
}

export function buildWhatsappMessageForOwner(pedido: PedidoSummaryShape) {
  const status = getPedidoStatusMeta(pedido.status).label;
  const composition = formatWhatsAppList(
    pedido.itens.map((item) => `${item.tipo} — ${item.quantidade} un`)
  );
  const payment = calculatePedidoPaymentSummary(pedido);

  return formatWhatsAppMessage([
    "🔔 *Novo Pedido Pago!*",
    [
      `👤 *Cliente:* ${pedido.clienteNome}`,
      `📞 *WhatsApp:* ${pedido.clienteTelefone}`,
      pedido.clienteEmail ? `✉️ *E-mail:* ${pedido.clienteEmail}` : null,
    ],
    [WHATSAPP_SECTION_DIVIDER, `🛍️ *Pedido #${pedido.codigo}*`, WHATSAPP_SECTION_DIVIDER],
    [
      `📌 *Status:* ${status}`,
      `📦 *Produto:* ${pedido.produtoNomeSnapshot}`,
      "🧆 *Composição:*",
      ...composition.map((item) => `  ${item}`),
      `📅 *Entrega:* ${formatDateTime(pedido.dataEntrega)}`,
      `💰 *Total do pedido:* ${formatCurrency(payment.subtotal)}`,
      `💳 *Pagamento:* ${pedido.metodoPagamentoLabel} (${pedido.percentualPagamento}% pago)`,
      `   Pago agora: ${formatCurrency(payment.paidNow)}`,
      payment.remaining > 0 ? `   Restante: ${formatCurrency(payment.remaining)}` : "   Restante: R$ 0,00",
    ],
    pedido.observacoes ? `📝 *Observações:* ${pedido.observacoes}` : null,
  ]);
}

export function buildWhatsappMessageForReady(pedido: Pick<Pedido, "codigo" | "clienteNome" | "produtoNomeSnapshot">) {
  return formatWhatsAppMessage([
    "🍽️ *Seu pedido está pronto!*",
    [
      `👋 Oi, ${pedido.clienteNome}!`,
      `Seu pedido *#${pedido.codigo}* da *${BUSINESS_INFO.name}* já está pronto.`,
    ],
    [`📦 *Produto:* ${pedido.produtoNomeSnapshot}`],
    [
      `⏰ Temos uma tolerância de *${BUSINESS_RULES.toleranceMinutes} minutos* após esse aviso.`,
      `📲 Se precisar falar com a equipe, chame no WhatsApp: ${BUSINESS_INFO.supportPhone}`,
    ],
  ]);
}

export function buildWhatsappMessageForReadyWithBalance({
  pedido,
  amount,
  paymentLabel,
  paymentUrl,
}: {
  pedido: Pick<Pedido, "codigo" | "clienteNome" | "produtoNomeSnapshot">;
  amount: number;
  paymentLabel: string;
  paymentUrl: string;
}) {
  return formatWhatsAppMessage([
    "🍽️ *Seu pedido está pronto!*",
    [
      `👋 Oi, ${pedido.clienteNome}!`,
      `Seu pedido *#${pedido.codigo}* da *${BUSINESS_INFO.name}* já está pronto.`,
      `📦 *Produto:* ${pedido.produtoNomeSnapshot}`,
    ],
    [
      "💰 *Falta o pagamento da 2ª parte*",
      `Valor para quitar agora: *${formatCurrency(amount)}*`,
      `Forma de pagamento: *${paymentLabel}*`,
    ],
    [
      "🔗 *Acesse sua cobrança para pagar:*",
      paymentUrl,
      "Ao abrir o link, você poderá concluir o pagamento e, quando disponível, copiar o Pix por lá.",
    ],
    `⏰ Temos uma tolerância de *${BUSINESS_RULES.toleranceMinutes} minutos* após esse aviso.`,
  ]);
}

export function buildWhatsappBalanceCardImageUrl({
  clienteNome,
  codigo,
  valor,
  metodoPagamentoLabel,
  appUrl,
}: {
  clienteNome: string;
  codigo: string;
  valor: number;
  metodoPagamentoLabel: string;
  appUrl: string;
}) {
  const params = new URLSearchParams({
    cliente: clienteNome,
    codigo,
    valor: formatCurrency(valor),
    metodo: metodoPagamentoLabel,
  });

  return `${appUrl.replace(/\/$/, "")}/api/whatsapp/cards/saldo?${params.toString()}`;
}

export function buildWhatsappReadyToleranceReminder(
  pedido: Pick<Pedido, "codigo" | "clienteNome">
) {
  return formatWhatsAppMessage([
    "⏰ *Lembrete de tolerância*",
    [
      `👋 ${pedido.clienteNome}, já se passaram *${BUSINESS_RULES.toleranceMinutes} minutos* desde o aviso de pedido pronto.`,
      `Seu pedido *#${pedido.codigo}* segue aguardando retirada/recebimento.`,
    ],
    `📲 Se houver qualquer imprevisto, fale com a equipe pelo WhatsApp: ${BUSINESS_INFO.supportPhone}`,
  ]);
}

const THERMAL_RECEIPT_COLUMNS = 30;

function stripReceiptDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function centerReceiptLine(value: string) {
  const normalized = stripReceiptDiacritics(value).trim();
  const padding = Math.max(0, Math.floor((THERMAL_RECEIPT_COLUMNS - normalized.length) / 2));

  return `${" ".repeat(padding)}${normalized}`;
}

function wrapReceiptText(value: string, columns = THERMAL_RECEIPT_COLUMNS) {
  const normalized = stripReceiptDiacritics(value).trim();

  if (!normalized) {
    return [];
  }

  if (normalized.length <= columns) {
    return [normalized];
  }

  const lines: string[] = [];
  let remaining = normalized;

  while (remaining.length > columns) {
    let breakAt = remaining.lastIndexOf(" ", columns);

    if (breakAt < Math.floor(columns * 0.6)) {
      breakAt = columns;
    }

    lines.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }

  if (remaining) {
    lines.push(remaining);
  }

  return lines;
}

function receiptField(label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return [];
  }

  const prefix = `${label}: `;
  const normalizedValue = stripReceiptDiacritics(String(value)).trim();
  const fullLine = `${prefix}${normalizedValue}`;

  if (fullLine.length <= THERMAL_RECEIPT_COLUMNS) {
    return [fullLine];
  }

  return [
    prefix.trimEnd(),
    ...wrapReceiptText(normalizedValue, THERMAL_RECEIPT_COLUMNS - 2).map((line) => `  ${line}`),
  ];
}

export function buildPrintableReceipt(pedido: PedidoSummaryShape) {
  const separator = "-".repeat(THERMAL_RECEIPT_COLUMNS);

  return [
    `#${centerReceiptLine(BUSINESS_INFO.name)}`,
    `#${centerReceiptLine(`PEDIDO ${pedido.codigo}`)}`,
    centerReceiptLine(`FEITO EM ${formatDateTime(pedido.createdAt)}`),
    centerReceiptLine(formatDateTime(pedido.dataEntrega)),
    separator,
    "#CLIENTE",
    ...receiptField("Nome", pedido.clienteNome),
    ...receiptField("WhatsApp", pedido.clienteTelefone),
    ...receiptField("E-mail", pedido.clienteEmail),
    separator,
    "#PRODUTO",
    ...wrapReceiptText(pedido.produtoNomeSnapshot),
    ...receiptField("Entrega", formatDateTime(pedido.dataEntrega)),
    separator,
    "#ITENS",
    ...pedido.itens.flatMap((item) => [
      ...wrapReceiptText(`- ${item.tipo}`),
      `  Quantidade: ${item.quantidade}`,
    ]),
    separator,
    "#PAGAMENTO",
    ...receiptField("Forma", pedido.metodoPagamentoLabel),
    ...receiptField("Pago agora", `${pedido.percentualPagamento}%`),
    ...receiptField("Subtotal", formatCurrency(Number(pedido.subtotal))),
    ...receiptField("Taxa serviço", formatCurrency(Number(pedido.taxaValor))),
    `TOTAL: ${formatCurrency(Number(pedido.totalCobrado))}`,
    pedido.raffleEntry ? separator : null,
    pedido.raffleEntry ? "#SORTEIO DIA DOS PAIS" : null,
    pedido.raffleEntry ? `CODIGO: ${pedido.raffleEntry.code}` : null,
    pedido.observacoes ? separator : null,
    pedido.observacoes ? "#OBS" : null,
    ...(pedido.observacoes ? wrapReceiptText(pedido.observacoes) : []),
  ]
    .filter(Boolean)
    .join("\n");
}
