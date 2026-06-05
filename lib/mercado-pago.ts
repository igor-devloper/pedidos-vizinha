import { createHmac, timingSafeEqual } from "crypto";

import { type Pedido } from "@prisma/client";

import { BUSINESS_INFO, SUPPORTED_PAYMENT_METHODS } from "@/lib/site-config";

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

type MercadoPagoPaymentResponse = {
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
};

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
  });

  const data = (await response.json().catch(() => null)) as T | { message?: string } | null;

  if (!response.ok) {
    throw new Error(
      (data && typeof data === "object" && "message" in data && data.message) ||
        `Mercado Pago respondeu ${response.status}.`
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
  pedido: Pick<
    Pedido,
    | "codigo"
    | "mpExternalReference"
    | "produtoNomeSnapshot"
    | "totalCobrado"
    | "clienteNome"
    | "clienteEmail"
    | "clienteTelefone"
    | "metodoPagamento"
  >;
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
      success: `${BUSINESS_INFO.appUrl}/checkout/retorno`,
      pending: `${BUSINESS_INFO.appUrl}/checkout/retorno`,
      failure: `${BUSINESS_INFO.appUrl}/checkout/retorno`,
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

export async function getMercadoPagoPayment(paymentId: string) {
  return mercadoPagoRequest<MercadoPagoPaymentResponse>(`/v1/payments/${paymentId}`);
}

export function verifyMercadoPagoWebhookSignature(request: Request) {
  const secret = getWebhookSecret();

  if (!secret) {
    return true;
  }

  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id") || url.searchParams.get("id") || "";

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
