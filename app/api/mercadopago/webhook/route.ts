import { NextResponse } from "next/server";

import { handleMercadoPagoPaymentUpdate } from "@/lib/pedido-service";
import {
  getMercadoPagoPayment,
  verifyMercadoPagoWebhookSignature,
} from "@/lib/mercado-pago";

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  try {
    if (!verifyMercadoPagoWebhookSignature(req)) {
      return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
    }

    const url = new URL(req.url);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const topic =
      String(body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "");
    const paymentId =
      String(
        body.data && typeof body.data === "object" && body.data !== null && "id" in body.data
          ? (body.data as { id?: string | number }).id
          : url.searchParams.get("data.id") || url.searchParams.get("id") || ""
      );

    if (!paymentId || topic !== "payment") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const payment = await getMercadoPagoPayment(paymentId);

    if (!payment.external_reference) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const pedido = await handleMercadoPagoPaymentUpdate({
      externalReference: payment.external_reference,
      paymentId: String(payment.id),
      merchantOrderId: payment.order?.id,
      status: payment.status,
      statusDetail: payment.status_detail,
      transactionAmount: payment.transaction_amount,
      payload: body,
    });

    return NextResponse.json({ ok: true, pedidoId: pedido.id, status: pedido.status });
  } catch (error) {
    console.error("POST /api/mercadopago/webhook error", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
