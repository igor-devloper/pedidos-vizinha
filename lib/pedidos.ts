import { createHash } from "crypto";

import { MetodoPagamento, PedidoStatus, type Pedido, type PedidoItem, type Produto } from "@prisma/client";
import { z } from "zod";

import { BUSINESS_INFO, BUSINESS_RULES, PEDIDO_STATUS_META, SUPPORTED_PAYMENT_METHODS } from "@/lib/site-config";
import {
  formatWhatsAppList,
  formatWhatsAppMessage,
  WHATSAPP_SECTION_DIVIDER,
} from "@/lib/whatsapp-message";

const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
const BUSINESS_UTC_OFFSET = "-03:00";

export const pedidoItemSchema = z.object({
  tipo: z.string().trim().min(1, "Informe o tipo de salgado."),
  quantidade: z.coerce.number().int().positive("A quantidade precisa ser maior que zero."),
});

export const createPedidoSchema = z.object({
  produtoId: z.string().trim().min(1),
  clienteNome: z.string().trim().min(2, "Informe o nome do cliente."),
  clienteTelefone: z.string().trim().min(10, "Informe um telefone valido."),
  clienteEmail: z.string().trim().email("Informe um e-mail valido.").optional().or(z.literal("")),
  observacoes: z.string().trim().max(500).optional().or(z.literal("")),
  dataEntrega: z.string().trim().min(1, "Escolha a data e hora de entrega."),
  percentualPagamento: z.union([z.literal(50), z.literal(100)]),
  metodoPagamento: z.nativeEnum(MetodoPagamento),
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
    timeZone: BUSINESS_TIME_ZONE,
  }).format(typeof value === "string" ? new Date(value) : value);
}

function getBusinessTimeParts(input: Date) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(input);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function getBusinessWeekday(input: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
  }).format(input);

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
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

export function getPedidoStatusMeta(status: PedidoStatus) {
  return PEDIDO_STATUS_META[status];
}

export function calculatePaymentAmounts(subtotal: number, paymentPercentage: 50 | 100, method: MetodoPagamento) {
  const methodConfig = getPaymentMethodConfig(method);

  if (!methodConfig) {
    throw new Error("Metodo de pagamento nao suportado.");
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

export function validateDeliveryDate(input: Date, now = new Date()) {
  const minDate = new Date(now.getTime() + BUSINESS_RULES.minimumLeadHours * 60 * 60 * 1000);
  const businessTime = getBusinessTimeParts(input);
  const weekday = getBusinessWeekday(input);
  const schedule = BUSINESS_RULES.scheduleByWeekday[weekday as keyof typeof BUSINESS_RULES.scheduleByWeekday];

  if (input.getTime() < minDate.getTime()) {
    throw new Error(`Escolha um horario com pelo menos ${BUSINESS_RULES.minimumLeadHours} horas de antecedencia.`);
  }

  if (!schedule) {
    throw new Error("Nao atendemos nas segundas-feiras. Escolha de terca a sabado, das 10h as 17h, ou domingo, das 9h as 13h.");
  }

  const hour = businessTime.hour;
  const minutes = businessTime.minute;

  if (hour < schedule.openHour || hour > schedule.closeHour) {
    if (weekday === 0) {
      throw new Error("Aos domingos, os pedidos precisam ficar entre 9h e 13h.");
    }

    throw new Error("De terca a sabado, os pedidos precisam ficar entre 10h e 17h.");
  }

  if (hour === schedule.closeHour && minutes > 0) {
    if (weekday === 0) {
      throw new Error("No domingo, o ultimo horario disponivel e as 13h.");
    }

    throw new Error("O ultimo horario disponivel de terca a sabado e as 17h.");
  }

  if (minutes % BUSINESS_RULES.slotMinutes !== 0) {
    throw new Error(`Escolha um horario em intervalos de ${BUSINESS_RULES.slotMinutes} minutos.`);
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

export function validatePedidoAgainstProduto(produto: Produto, items: ReturnType<typeof normalizePedidoItems>) {
  const totalUnidades = items.reduce((sum, item) => sum + item.quantidade, 0);
  const totalTipos = items.length;

  if (totalUnidades !== produto.totalUnidades) {
    throw new Error(`Esse produto exige exatamente ${produto.totalUnidades} unidades.`);
  }

  if (totalTipos > produto.maxTiposSalgado) {
    throw new Error(`Esse produto permite no maximo ${produto.maxTiposSalgado} tipos diferentes.`);
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
  | "percentualPagamento"
  | "observacoes"
  | "produtoNomeSnapshot"
  | "status"
> & {
  itens: Pick<PedidoItem, "tipo" | "quantidade">[];
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

export function buildWhatsappMessageForClient(pedido: PedidoSummaryShape) {
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
    [
      WHATSAPP_SECTION_DIVIDER,
      `⏰ Tolerância combinada: ${BUSINESS_RULES.toleranceMinutes} minutos.`,
      "Obrigada pela preferência! 🥰",
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

export function buildPrintableReceipt(pedido: PedidoSummaryShape) {
  return [
    BUSINESS_INFO.name,
    `Pedido ${pedido.codigo}`,
    `${formatDateTime(pedido.dataEntrega)}`,
    "------------------------------",
    `Cliente: ${pedido.clienteNome}`,
    `Telefone: ${pedido.clienteTelefone}`,
    pedido.clienteEmail ? `E-mail: ${pedido.clienteEmail}` : null,
    `Produto: ${pedido.produtoNomeSnapshot}`,
    `Pagamento: ${pedido.percentualPagamento}% - ${pedido.metodoPagamentoLabel}`,
    "------------------------------",
    ...pedido.itens.map((item) => `${item.tipo} x ${item.quantidade}`),
    "------------------------------",
    `Subtotal: ${formatCurrency(Number(pedido.subtotal))}`,
    `Taxa de servico: ${formatCurrency(Number(pedido.taxaValor))}`,
    `Total: ${formatCurrency(Number(pedido.totalCobrado))}`,
    pedido.observacoes ? "------------------------------" : null,
    pedido.observacoes ? `Obs: ${pedido.observacoes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
