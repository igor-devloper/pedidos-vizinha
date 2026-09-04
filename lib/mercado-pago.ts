import { createHash, createHmac, timingSafeEqual } from "crypto";

import { Prisma, type Pedido } from "@prisma/client";

import { BUSINESS_INFO, SUPPORTED_PAYMENT_METHODS } from "@/lib/site-config";
import { getMercadoPagoWebhookUrl, getOrderReturnUrl } from "@/lib/order-urls";

type MercadoPagoPaymentMethodApi = {
  id: string;
  name: string;
  payment_type_id: "account_money" | "bank_transfer" | "credit_card" | "debit_card" | "ticket" | string;
  status: string;
};

type MercadoPagoPreferenceResponse = {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
};

export type MercadoPagoPaymentResponse = {
  id: number;
  status: string;
  status_detail?: string;
  transaction_amount?: number;
  date_approved?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  external_reference?: string;
  order?: {
    id?: string | number | null;
  };
  metadata?: Record<string, unknown>;
  date_of_expiration?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
    };
  };
};

type MercadoPagoPaymentSearchResponse = {
  results?: MercadoPagoPaymentResponse[];
};

type MercadoPagoErrorResponse = {
  code?: string;
  message?: string;
  error?: string;
  cause?: Array<{
    code?: string | number;
    description?: string;
  }>;
};

export class MercadoPagoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly code?: string,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = "MercadoPagoApiError";
  }
}

const MERCADO_PAGO_STATUS_MESSAGES: Record<string, string> = {
  bad_filled_card_data: "Confira os dados do cartão e tente novamente.",
  card_disabled: "Este cartão está bloqueado ou desabilitado. Fale com o banco ou use outro cartão.",
  cc_rejected_bad_filled_card_number: "Confira o número do cartão.",
  cc_rejected_bad_filled_date: "Confira a data de validade do cartão.",
  cc_rejected_bad_filled_other: "Confira os dados do cartão e tente novamente.",
  cc_rejected_bad_filled_security_code: "Confira o código de segurança do cartão.",
  cc_rejected_call_for_authorize: "O banco precisa autorizar esta compra. Fale com o banco ou use outro cartão.",
  cc_rejected_card_disabled: "Este cartão está bloqueado ou desabilitado. Fale com o banco ou use outro cartão.",
  cc_rejected_duplicated_payment: "Este pagamento já foi enviado. Aguarde a confirmação antes de tentar novamente.",
  cc_rejected_high_risk: "O pagamento não foi autorizado. Use outra forma de pagamento.",
  cc_rejected_insufficient_amount: "Saldo ou limite insuficiente. Use outro cartão ou forma de pagamento.",
  cc_rejected_invalid_installments: "O número de parcelas escolhido não está disponível.",
  cc_rejected_max_attempts: "O limite de tentativas foi atingido. Use outro cartão ou forma de pagamento.",
  cc_rejected_other_reason: "O banco não autorizou o pagamento. Tente novamente ou use outro cartão.",
  high_risk: "O pagamento não foi autorizado. Use outra forma de pagamento.",
  insufficient_amount: "Saldo ou limite insuficiente. Use outro cartão ou forma de pagamento.",
  invalid_installments: "O número de parcelas escolhido não está disponível.",
  max_attempts_exceeded: "O limite de tentativas foi atingido. Use outro cartão ou forma de pagamento.",
  rejected_by_issuer: "O banco não autorizou o pagamento. Tente novamente ou use outro cartão.",
  required_call_for_authorize: "O banco precisa autorizar esta compra. Fale com o banco ou use outro cartão.",
};

export function getMercadoPagoPaymentStatusMessage(statusDetail?: string | null) {
  if (!statusDetail) return "Não foi possível processar o pagamento. Tente novamente.";
  return MERCADO_PAGO_STATUS_MESSAGES[statusDetail] || "O pagamento não foi autorizado. Tente novamente ou use outra forma de pagamento.";
}

export function getMercadoPagoErrorMessage(error: unknown) {
  if (!(error instanceof MercadoPagoApiError)) {
    return "Não foi possível processar o pagamento. Tente novamente.";
  }

  const normalizedMessage = `${error.code || ""} ${error.message}`.toLowerCase();

  if (
    error.code === "17" ||
    normalizedMessage.includes("unauthorized use of live credentials")
  ) {
    return "As credenciais do Mercado Pago não correspondem ao ambiente atual. Configure o par de Public Key e Access Token de teste ou ative o par de produção da mesma integração.";
  }
  const statusDetail = Object.keys(MERCADO_PAGO_STATUS_MESSAGES).find((detail) =>
    normalizedMessage.includes(detail)
  );

  if (statusDetail) return getMercadoPagoPaymentStatusMessage(statusDetail);
  if (error.status === 401 || error.status === 403) {
    return "O pagamento está temporariamente indisponível. Tente novamente mais tarde.";
  }
  if (error.status === 429) {
    return "Muitas tentativas de pagamento. Aguarde um momento e tente novamente.";
  }

  return "Não foi possível processar o pagamento. Confira os dados e tente novamente.";
}

type CartMercadoPagoOrder = {
  id: string;
  externalReference: string;
  code?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
};

type CartMercadoPagoPayer = {
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  identification?: {
    type: string;
    number: string;
  } | null;
};

function buildCartPaymentPayer(order: CartMercadoPagoOrder, payer: CartMercadoPagoPayer) {
  const phone = payer.phone || order.customerPhone;

  return {
    email: payer.email || order.customerEmail || undefined,
    first_name: payer.name || order.customerName || undefined,
    phone: phone
      ? { number: String(phone).replace(/\D/g, "") }
      : undefined,
    identification: payer.identification || undefined,
  };
}

function getCartPaymentBase(order: CartMercadoPagoOrder, payer: CartMercadoPagoPayer, chargedAmount: number) {
  return {
    transaction_amount: Number(chargedAmount),
    external_reference: order.externalReference,
    description: `Pedido ${order.code || order.id.slice(0, 8).toUpperCase()}`,
    notification_url: getMercadoPagoWebhookUrl(),
    payer: buildCartPaymentPayer(order, payer),
    metadata: {
      cartOrderId: order.id,
      cartOrderCode: order.code || order.id.slice(0, 8).toUpperCase(),
    },
  };
}

function getAccessToken() {
  const token =
    process.env.envMERCADO_PAGO_ACCESS_TOKEN?.trim() ||
    process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim() ||
    "";

  if (!token) {
    throw new Error("Mercado Pago access token não configurado.");
  }

  return token;
}

function getWebhookSecret() {
  return (
    process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() ||
    process.env.MP_WEBHOOK_SECRET?.trim() ||
    ""
  );
}

async function mercadoPagoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(10000),
  });

  const data = (await response.json().catch(() => null)) as T | MercadoPagoErrorResponse | null;

  if (!response.ok) {
    const apiError =
      data && typeof data === "object"
        ? (data as MercadoPagoErrorResponse)
        : null;
    const requestId = response.headers.get("x-request-id") || undefined;
    const responseCode = apiError?.code || apiError?.error || apiError?.cause?.[0]?.code;

    // Loga a resposta ORIGINAL do Mercado Pago para não perder
    // cause[].description, códigos internos e demais detalhes.
    console.error("Mercado Pago API error", {
      status: response.status,
      path,
      requestId,
      code: responseCode,
      response: data,
    });

    throw new MercadoPagoApiError(
      apiError?.message ||
        `Mercado Pago respondeu ${response.status}.`,
      response.status,
      path,
      String(responseCode || "") || undefined,
      requestId
    );
  }

  return data as T;
}

export async function listMercadoPagoMethods() {
  try {
    const methods = await mercadoPagoRequest<MercadoPagoPaymentMethodApi[]>("/v1/payment_methods");

    return SUPPORTED_PAYMENT_METHODS.map((supported) => {
      const method = methods.find(
        (item) =>
          item.status === "active" &&
          item.payment_type_id === supported.paymentTypeId &&
          (!supported.defaultMethodId || item.id === supported.defaultMethodId)
      );

      return {
        ...supported,
        gatewayMethodId: method?.id || supported.defaultMethodId,
      };
    });
  } catch (error) {
    console.error("Mercado Pago methods fallback", error);
    return SUPPORTED_PAYMENT_METHODS.map((method) => ({
      ...method,
      gatewayMethodId: method.defaultMethodId,
    }));
  }
}

export async function createMercadoPagoPreference({
  pedido,
  payer,
}: {
  pedido: {
    codigo: string;
    mpExternalReference: string;
    produtoNomeSnapshot: string;
    totalCobrado: number | string | Prisma.Decimal;
    clienteNome: string;
    clienteEmail?: string | null;
    clienteTelefone: string;
    metodoPagamento: Pedido["metodoPagamento"];
  };
  payer: {
    email?: string | null;
    name: string;
    phone?: string | null;
  };
}) {
  const methods = await listMercadoPagoMethods();
  const selected = methods.find((method) => method.id === pedido.metodoPagamento);

  if (!selected) {
    throw new Error("Método de pagamento indisponível no Mercado Pago.");
  }

  const excludedPaymentTypes = methods
    .filter((method) => method.id !== pedido.metodoPagamento)
    .map((method) => ({ id: method.paymentTypeId }));

  const paymentMethodsConfig: {
    excluded_payment_types: Array<{ id: string }>;
    installments: number;
  } = {
    excluded_payment_types: excludedPaymentTypes,
    installments: 1,
  };

  const payload = {
    items: [
      {
        id: pedido.codigo,
        title: `${pedido.produtoNomeSnapshot} - Pedido ${pedido.codigo}`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number(pedido.totalCobrado),
      },
    ],
    external_reference: pedido.mpExternalReference,
    notification_url:
      process.env.MP_WEBHOOK_URL?.trim() ||
      `${BUSINESS_INFO.appUrl}/api/mercadopago/webhook`,
    back_urls: {
      success: `${BUSINESS_INFO.appUrl}/checkout/retorno?ref=${encodeURIComponent(pedido.mpExternalReference)}`,
      pending: `${BUSINESS_INFO.appUrl}/checkout/retorno?ref=${encodeURIComponent(pedido.mpExternalReference)}`,
      failure: `${BUSINESS_INFO.appUrl}/checkout/retorno?ref=${encodeURIComponent(pedido.mpExternalReference)}`,
    },
    auto_return: "approved",
    statement_descriptor: BUSINESS_INFO.name.slice(0, 13),
    payer: {
      name: payer.name,
      email: payer.email || undefined,
      phone: payer.phone
        ? {
            number: payer.phone.replace(/\D/g, ""),
          }
        : undefined,
    },
    payment_methods: paymentMethodsConfig,
    metadata: {
      pedidoCodigo: pedido.codigo,
      metodoPagamento: pedido.metodoPagamento,
    },
  };

  return mercadoPagoRequest<MercadoPagoPreferenceResponse>("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createCartMercadoPagoPreference({
  order,
  items,
  payer,
  paymentMethod,
  chargedAmount,
}: {
  order: {
    id: string;
    externalReference: string;
    code?: string | null;
    customerName?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
  };
  items: Array<{
    id: string;
    title: string;
    quantity: number;
    unitPrice: number | string | Prisma.Decimal;
  }>;
  payer: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  };
  paymentMethod: Pedido["metodoPagamento"];
  chargedAmount: number;
}) {
  const methods = await listMercadoPagoMethods();
  const selected = methods.find((method) => method.id === paymentMethod);

  if (!selected) {
    throw new Error("Método de pagamento indisponível no Mercado Pago.");
  }

  const excludedPaymentTypes = methods
    .filter((method) => method.id !== paymentMethod)
    .map((method) => ({ id: method.paymentTypeId }));

  const payload = {
    items: [
      {
        id: order.code || order.id,
        title: items.length === 1
          ? `${items[0].title} - Pedido ${order.code || order.id.slice(0, 8).toUpperCase()}`
          : `Pedido ${order.code || order.id.slice(0, 8).toUpperCase()} - carrinho`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number(chargedAmount),
      },
    ],
    external_reference: order.externalReference,
    notification_url: getMercadoPagoWebhookUrl(),
    back_urls: {
      success: getOrderReturnUrl(order.externalReference),
      pending: getOrderReturnUrl(order.externalReference),
      failure: getOrderReturnUrl(order.externalReference),
    },
    auto_return: "approved",
    statement_descriptor: BUSINESS_INFO.name.slice(0, 13),
    payer: {
      name: payer.name || order.customerName || undefined,
      email: payer.email || order.customerEmail || undefined,
      phone: payer.phone || order.customerPhone
        ? {
            number: String(payer.phone || order.customerPhone).replace(/\D/g, ""),
          }
        : undefined,
    },
    payment_methods: {
      excluded_payment_types: excludedPaymentTypes,
      installments: 1,
    },
    metadata: {
      cartOrderId: order.id,
      cartOrderCode: order.code || order.id.slice(0, 8).toUpperCase(),
      metodoPagamento: paymentMethod,
    },
  };

  return mercadoPagoRequest<MercadoPagoPreferenceResponse>("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createCartMercadoPagoPixPayment({
  order,
  payer,
  chargedAmount,
  idempotencySuffix,
}: {
  order: CartMercadoPagoOrder;
  payer: CartMercadoPagoPayer;
  chargedAmount: number;
  idempotencySuffix?: string;
}) {
  const methods = await listMercadoPagoMethods();
  const pixMethod = methods.find(
    (method) =>
      method.id === "PIX" &&
      method.paymentTypeId === "bank_transfer" &&
      method.gatewayMethodId === "pix"
  );

  if (!pixMethod) {
    throw new Error("Pix indisponível no Mercado Pago.");
  }

  const payment = await mercadoPagoRequest<MercadoPagoPaymentResponse>("/v1/payments", {
    method: "POST",
    headers: {
      "X-Idempotency-Key": `cart-${order.id}-pix${idempotencySuffix ? `-${idempotencySuffix}` : ""}`,
    },
    body: JSON.stringify({
      ...getCartPaymentBase(order, payer, chargedAmount),
      payment_method_id: "pix",
    }),
  });

  return {
    id: payment.id,
    status: payment.status,
    transactionAmount: payment.transaction_amount,
    statusDetail: payment.status_detail || null,
    qrCode: payment.point_of_interaction?.transaction_data?.qr_code || null,
    qrCodeBase64:
      payment.point_of_interaction?.transaction_data?.qr_code_base64 || null,
    expirationDate: payment.date_of_expiration || null,
  };
}

export async function createCartMercadoPagoCardPayment({
  order,
  payer,
  chargedAmount,
  token,
  paymentMethodId,
  issuerId,
  installments,
}: {
  order: CartMercadoPagoOrder;
  payer: CartMercadoPagoPayer;
  chargedAmount: number;
  token: string;
  paymentMethodId: string;
  issuerId: string | number;
  installments: number;
}) {
  const methods = await listMercadoPagoMethods();
  const cardPaymentsEnabled = methods.some(
    (method) =>
      (method.paymentTypeId === "credit_card" || method.paymentTypeId === "debit_card") &&
      Boolean(method.gatewayMethodId)
  );

  if (!cardPaymentsEnabled) {
    throw new Error("Pagamento com cartão indisponível no Mercado Pago.");
  }

  const payment = await mercadoPagoRequest<MercadoPagoPaymentResponse>("/v1/payments", {
    method: "POST",
    headers: {
      "X-Idempotency-Key": `cart-${order.id}-card-${createHash("sha256").update(token).digest("hex").slice(0, 16)}`,
    },
    body: JSON.stringify({
      ...getCartPaymentBase(order, payer, chargedAmount),
      token,
      payment_method_id: paymentMethodId,
      issuer_id: issuerId,
      installments,
    }),
  });

  return {
    id: payment.id,
    status: payment.status,
    transactionAmount: payment.transaction_amount,
    statusDetail: payment.status_detail || null,
  };
}

export async function getMercadoPagoPayment(paymentId: string) {
  return mercadoPagoRequest<MercadoPagoPaymentResponse>(`/v1/payments/${paymentId}`);
}

export async function findLatestMercadoPagoPaymentByExternalReference(externalReference: string) {
  const params = new URLSearchParams({
    external_reference: externalReference,
    sort: "date_created",
    criteria: "desc",
    limit: "1",
  });

  const data = await mercadoPagoRequest<MercadoPagoPaymentSearchResponse>(
    `/v1/payments/search?${params.toString()}`
  );

  return data.results?.[0] || null;
}

export function verifyMercadoPagoWebhookSignature(request: Request, dataIdOverride?: string) {
  const secret = getWebhookSecret();

  if (!secret) {
    return true;
  }

  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const url = new URL(request.url);
  const dataId = dataIdOverride || url.searchParams.get("data.id") || url.searchParams.get("id") || "";

  if (!signature || !requestId || !dataId) {
    return false;
  }

  const parts = signature.split(",");
  const ts = parts.find((part) => part.trim().startsWith("ts="))?.split("=")[1]?.trim() || "";
  const v1 = parts.find((part) => part.trim().startsWith("v1="))?.split("=")[1]?.trim() || "";

  if (!ts || !v1) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(v1);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}
