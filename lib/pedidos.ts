import { createHash } from "crypto";

import { MetodoPagamento, PedidoStatus, type Pedido, type PedidoItem, type Produto } from "@prisma/client";
import { z } from "zod";

import { BUSINESS_INFO, BUSINESS_RULES, PEDIDO_STATUS_META, SUPPORTED_PAYMENT_METHODS } from "@/lib/site-config";

export const pedidoItemSchema = z.object({
  tipo: z.string().trim().min(1, "Informe o tipo de salgado."),
  quantidade: z.coerce.number().int().positive("A quantidade precisa ser maior que zero."),
});

export const createPedidoSchema = z.object({
  produtoId: z.string().trim().min(1),
  clienteNome: z.string().trim().min(2, "Informe o nome do cliente."),
  clienteTelefone: z.string().trim().min(10, "Informe um telefone válido."),
  clienteEmail: z.string().trim().email("Informe um e-mail válido.").optional().or(z.literal("")),
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

export function getPedidoStatusMeta(status: PedidoStatus) {
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
  const date = new Date(input);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Data de entrega inválida.");
  }

  return date;
}

export function validateDeliveryDate(input: Date, now = new Date()) {
  const minDate = new Date(now.getTime() + BUSINESS_RULES.minimumLeadHours * 60 * 60 * 1000);

  if (input.getTime() < minDate.getTime()) {
    throw new Error(`Escolha um horário com pelo menos ${BUSINESS_RULES.minimumLeadHours} horas de antecedência.`);
  }

  const hour = input.getHours();
  const minutes = input.getMinutes();

  if (hour < BUSINESS_RULES.openingHour || hour > BUSINESS_RULES.closingHour) {
    throw new Error("O horário precisa ficar dentro do atendimento das 09h às 17h.");
  }

  if (hour === BUSINESS_RULES.closingHour && minutes > 0) {
    throw new Error("O último horário disponível é às 17h.");
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

export function validatePedidoAgainstProduto(produto: Produto, items: ReturnType<typeof normalizePedidoItems>) {
  const totalUnidades = items.reduce((sum, item) => sum + item.quantidade, 0);
  const totalTipos = items.length;

  if (totalUnidades !== produto.totalUnidades) {
    throw new Error(`Esse produto exige exatamente ${produto.totalUnidades} unidades.`);
  }

  if (totalTipos > produto.maxTiposSalgado) {
    throw new Error(`Esse produto permite no máximo ${produto.maxTiposSalgado} tipos diferentes.`);
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

export function buildPedidoSummary(pedido: PedidoSummaryShape) {
  const itens = pedido.itens
    .map((item) => `- ${item.tipo}: ${item.quantidade} un`)
    .join("\n");

  return [
    `Pedido ${pedido.codigo}`,
    `Cliente: ${pedido.clienteNome}`,
    `Produto: ${pedido.produtoNomeSnapshot}`,
    `Entrega: ${formatDateTime(pedido.dataEntrega)}`,
    `Pagamento agora: ${pedido.percentualPagamento}% via ${pedido.metodoPagamentoLabel}`,
    `Subtotal: ${formatCurrency(Number(pedido.subtotal))}`,
    `Taxa de serviço: ${formatCurrency(Number(pedido.taxaValor))}`,
    `Total cobrado: ${formatCurrency(Number(pedido.totalCobrado))}`,
    "Itens:",
    itens,
    pedido.observacoes ? `Observações: ${pedido.observacoes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildWhatsappMessageForClient(pedido: PedidoSummaryShape) {
  return [
    `Oi, ${pedido.clienteNome}!`,
    "",
    `Seu pagamento do pedido ${pedido.codigo} foi confirmado com sucesso.`,
    `Entrega agendada para ${formatDateTime(pedido.dataEntrega)}.`,
    `Produto: ${pedido.produtoNomeSnapshot}.`,
    `Valor confirmado: ${formatCurrency(Number(pedido.totalCobrado))}.`,
    "",
    "Resumo do pedido:",
    ...pedido.itens.map((item) => `- ${item.tipo}: ${item.quantidade} un`),
    pedido.observacoes ? "" : null,
    pedido.observacoes ? `Observações: ${pedido.observacoes}` : null,
    "",
    `Tolerância combinada: ${BUSINESS_RULES.toleranceMinutes} minutos.`,
    `Qualquer ajuste, fale com a ${BUSINESS_INFO.name}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildWhatsappMessageForOwner(pedido: PedidoSummaryShape) {
  const status = getPedidoStatusMeta(pedido.status).label;

  return [
    `Novo pedido pago para preparo: ${pedido.codigo}`,
    `Status: ${status}`,
    `Cliente: ${pedido.clienteNome}`,
    `Telefone: ${pedido.clienteTelefone}`,
    pedido.clienteEmail ? `E-mail: ${pedido.clienteEmail}` : null,
    `Entrega: ${formatDateTime(pedido.dataEntrega)}`,
    `Produto: ${pedido.produtoNomeSnapshot}`,
    `Pagamento: ${pedido.percentualPagamento}% via ${pedido.metodoPagamentoLabel}`,
    `Total cobrado: ${formatCurrency(Number(pedido.totalCobrado))}`,
    "Itens:",
    ...pedido.itens.map((item) => `- ${item.tipo}: ${item.quantidade} un`),
    pedido.observacoes ? `Observações: ${pedido.observacoes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
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
    `Taxa de serviço: ${formatCurrency(Number(pedido.taxaValor))}`,
    `Total: ${formatCurrency(Number(pedido.totalCobrado))}`,
    pedido.observacoes ? "------------------------------" : null,
    pedido.observacoes ? `Obs: ${pedido.observacoes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
