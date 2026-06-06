import { MetodoPagamento, type PedidoStatus } from "@prisma/client";

function parseFee(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const BUSINESS_RULES = {
  minimumLeadHours: 2,
  scheduleByWeekday: {
    0: { openHour: 9, closeHour: 13 },
    1: null,
    2: { openHour: 10, closeHour: 17 },
    3: { openHour: 10, closeHour: 17 },
    4: { openHour: 10, closeHour: 17 },
    5: { openHour: 10, closeHour: 17 },
    6: { openHour: 10, closeHour: 17 },
  },
  slotMinutes: 15,
  toleranceMinutes: 15,
} as const;

export const BUSINESS_INFO = {
  name: process.env.BUSINESS_NAME?.trim() || "Vizinha Salgateria",
  appUrl: process.env.APP_URL?.trim() || "http://localhost:3000",
  supportPhone: process.env.BUSINESS_WHATSAPP?.trim() || "(83) 99376-0485",
  ownerPhone: process.env.VIZINHA_OWNER_PHONE?.trim() || process.env.BUSINESS_WHATSAPP?.trim() || "839",
} as const;

export type SupportedPaymentMethod = {
  id: MetodoPagamento;
  label: string;
  description: string;
  paymentTypeId: "bank_transfer" | "credit_card" | "debit_card" | "ticket";
  defaultMethodId?: string;
  feePercent: number;
};

export const SUPPORTED_PAYMENT_METHODS: SupportedPaymentMethod[] = [
  {
    id: MetodoPagamento.PIX,
    label: "Pix",
    description: "Confirmação rápida do pagamento.",
    paymentTypeId: "bank_transfer",
    defaultMethodId: "pix",
    feePercent: parseFee(process.env.MP_FEE_PIX, 0.99),
  },
  {
    id: MetodoPagamento.CARTAO_CREDITO,
    label: "Cartão de crédito",
    description: "Pagamento online com aprovação prática.",
    paymentTypeId: "credit_card",
    feePercent: parseFee(process.env.MP_FEE_CREDIT, 4.99),
  },
  {
    id: MetodoPagamento.CARTAO_DEBITO,
    label: "Cartão de débito",
    description: "Pagamento à vista no site.",
    paymentTypeId: "debit_card",
    feePercent: parseFee(process.env.MP_FEE_DEBIT, 2.99),
  },
  {
    id: MetodoPagamento.BOLETO,
    label: "Boleto",
    description: "Compensação sujeita ao prazo do boleto.",
    paymentTypeId: "ticket",
    feePercent: parseFee(process.env.MP_FEE_BOLETO, 3.49),
  },
];

export const PEDIDO_STATUS_META: Record<
  PedidoStatus | "PRONTO",
  { label: string; tone: string }
> = {
  PENDENTE_PAGAMENTO: {
    label: "Pendente",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
  },
  PAGO: {
    label: "Pago",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  EM_PREPARO: {
    label: "Em preparo",
    tone: "border-sky-200 bg-sky-50 text-sky-800",
  },
  PRONTO: {
    label: "Pronto",
    tone: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
  },
  ENTREGUE: {
    label: "Entregue",
    tone: "border-violet-200 bg-violet-50 text-violet-800",
  },
  CANCELADO: {
    label: "Cancelado",
    tone: "border-rose-200 bg-rose-50 text-rose-800",
  },
};
