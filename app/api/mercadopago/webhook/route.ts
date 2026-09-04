import { NextResponse } from "next/server";

import {
  applyCartOrderPayment,
  CartOrderPaymentApplyError,
} from "@/lib/cart-order-payment";
import {
  handleMercadoPagoPaymentUpdate,
  PedidoPaymentReferenceNotFoundError,
} from "@/lib/pedido-service";
import {
  getMercadoPagoPayment,
  MercadoPagoApiError,
  verifyMercadoPagoWebhookSignature,
} from "@/lib/mercado-pago";

export const runtime = "nodejs";
export const maxDuration = 30;

type MpWebhookBody = {
  action?: string;
  api_version?: string;
  data?: {
    id?: string | number;
  };
  date_created?: string;
  id?: string | number;
  live_mode?: boolean;
  type?: string;
  topic?: string;
  user_id?: string | number;
};

export async function GET(req: Request) {
  console.log("[MP webhook] GET", req.url);
  return NextResponse.json({ ok: true, message: "Webhook endpoint ativo" }, { status: 200 });
}

export async function POST(req: Request) {
  try {
    console.log("[MP webhook] Headers:", {
      "x-signature": req.headers.get("x-signature"),
      "x-request-id": req.headers.get("x-request-id"),
      "content-type": req.headers.get("content-type"),
    });
    console.log("[MP webhook] URL:", req.url);

    const bodyText = await req.text();
    console.log("[MP webhook] Body raw:", bodyText);

    let body: MpWebhookBody = {};

    try {
      body = bodyText ? (JSON.parse(bodyText) as MpWebhookBody) : {};
    } catch (parseErr) {
      console.error("[MP webhook] Erro ao fazer parse do body:", parseErr);
      return NextResponse.json(
        { ok: false, reason: "invalid-json" },
        { status: 200 }
      );
    }

    console.log("[MP webhook] Body parsed:", body);

    const url = new URL(req.url);
    const topic = String(
      body.type ||
        body.topic ||
        url.searchParams.get("type") ||
        url.searchParams.get("topic") ||
        ""
    );
    const paymentId = String(
      body.data?.id ||
        url.searchParams.get("data.id") ||
        url.searchParams.get("id") ||
        ""
    );

    try {
      const signatureOk = verifyMercadoPagoWebhookSignature(req, paymentId);

      if (!signatureOk) {
        console.error("[MP webhook] assinatura inválida ou ausente");
        return NextResponse.json(
          { ok: false, reason: "invalid-signature" },
          { status: 401 },
        );
      }
    } catch (sigErr) {
      console.error("[MP webhook] erro ao validar assinatura:", sigErr);
    }

    if (!paymentId || topic !== "payment") {
      console.log("[MP webhook] Evento ignorado:", { topic, paymentId });
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
    }

    try {
      const payment = await Promise.race([
        getMercadoPagoPayment(paymentId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout ao buscar pagamento no Mercado Pago")), 8000)
        ),
      ]);

      console.log("[MP webhook] Pagamento encontrado:", {
        paymentId: payment.id,
        externalReference: payment.external_reference,
        status: payment.status,
        statusDetail: payment.status_detail,
        transactionAmount: payment.transaction_amount,
      });

      if (!payment.external_reference) {
        console.log("[MP webhook] Pagamento sem external_reference:", paymentId);
        return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
      }

      if (payment.external_reference.startsWith("cart-")) {
        const order = await applyCartOrderPayment(payment);

        console.log("[MP webhook] Order do carrinho atualizado com sucesso:", {
          orderId: order?.id,
          status: order?.status,
          paymentId,
        });
      } else {
        const pedido = await handleMercadoPagoPaymentUpdate({
          externalReference: payment.external_reference,
          paymentId: String(payment.id),
          merchantOrderId: payment.order?.id,
          status: payment.status,
          statusDetail: payment.status_detail,
          transactionAmount: payment.transaction_amount,
          dateApproved: payment.date_approved,
          liveMode: payment.live_mode,
          payload: body,
        });

        console.log("[MP webhook] Pedido atualizado com sucesso:", {
          pedidoId: pedido.id,
          codigo: pedido.codigo,
          status: pedido.status,
          paymentId,
        });
      }
    } catch (processingErr) {
      if (
        processingErr instanceof MercadoPagoApiError &&
        processingErr.status === 404
      ) {
        console.warn("[MP webhook] Pagamento não encontrado no Mercado Pago:", {
          paymentId,
          topic,
          action: body.action,
        });
        return NextResponse.json(
          { ok: true, ignored: true, reason: "payment-not-found" },
          { status: 200 }
        );
      }

      if (processingErr instanceof PedidoPaymentReferenceNotFoundError) {
        console.warn("[MP webhook] Referencia de pagamento sem pedido local:", {
          paymentId,
          externalReference: processingErr.externalReference,
        });
        return NextResponse.json(
          { ok: true, ignored: true, reason: "local-reference-not-found" },
          { status: 200 }
        );
      }

      if (processingErr instanceof CartOrderPaymentApplyError) {
        console.error("[MP webhook] Erro ao aplicar pagamento no carrinho:", {
          ...processingErr.context,
          cause: processingErr.cause,
        });
        return NextResponse.json(
          { ok: false, error: "cart-payment-apply-failed" },
          { status: 500 }
        );
      }

      console.error("[MP webhook] Erro ao processar pagamento:", processingErr);
      return NextResponse.json(
        { ok: false, error: "payment-processing-failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[MP webhook] Erro geral:", error);
    return NextResponse.json({ ok: false, error: "webhook-error" }, { status: 200 });
  }
}
