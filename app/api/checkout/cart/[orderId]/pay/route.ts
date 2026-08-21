import { MetodoPagamento, OrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  applyCartOrderPayment,
  getOrderStatusFromMercadoPagoStatus,
} from "@/lib/cart-order-payment";
import { prisma } from "@/lib/db";
import {
  createCartMercadoPagoCardPayment,
  createCartMercadoPagoPixPayment,
  getMercadoPagoErrorMessage,
  getMercadoPagoPaymentStatusMessage,
  MercadoPagoApiError,
} from "@/lib/mercado-pago";
  
const cardPaymentSchema = z.object({
  token: z.string().trim().min(1, "Token do cartão não informado."),
  payment_method_id: z.string().trim().min(1, "Método do cartão não informado."),
  issuer_id: z.union([z.string().trim().min(1), z.number().int().positive()]),
  installments: z.coerce.number().int().positive("Número de parcelas inválido."),
  payer: z.object({
    email: z.string().trim().email("Informe um e-mail válido."),
    identification: z.object({
      type: z.string().trim().min(1),
      number: z.string().trim().min(1),
    }).optional(),
  }),
});

export async function GET(
  req: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  const balance = new URL(req.url).searchParams.get("balance") === "1";
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      externalReference: true,
      saldoExternalReference: true,
      saldoPagoAt: true,
      status: true,
      paymentMethod: true,
      mercadoPagoStatusDetail: true,
      pixExpirationDate: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    orderId: order.id,
    externalReference: balance ? order.saldoExternalReference : order.externalReference,
    status: balance ? (order.saldoPagoAt ? "PAID" : "PENDING") : order.status,
    paymentMethod: order.paymentMethod,
    statusDetail: order.mercadoPagoStatusDetail,
    pixExpirationDate: order.pixExpirationDate?.toISOString() || null,
  });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await context.params;
    const balance = new URL(req.url).searchParams.get("balance") === "1";
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      return NextResponse.json(
        { error: "Pedido não encontrado." },
        { status: 404 },
      );
    }

    if (balance && (!order.saldoExternalReference || !order.saldoTotalCobrado || order.saldoPagoAt)) {
      return NextResponse.json({ error: "Não há saldo pendente para este pedido." }, { status: 409 });
    }

    const expiredPixCanRetry =
      order.paymentMethod === MetodoPagamento.PIX &&
      order.pixExpirationDate !== null &&
      order.pixExpirationDate.getTime() <= Date.now();
    const rejectedCardCanRetry =
      (order.paymentMethod === MetodoPagamento.CARTAO_CREDITO ||
        order.paymentMethod === MetodoPagamento.CARTAO_DEBITO) &&
      !balance && order.status === OrderStatus.CANCELLED &&
      Boolean(order.mercadoPagoStatusDetail);

    if (
      !balance && order.status !== OrderStatus.PENDING &&
      !expiredPixCanRetry &&
      !rejectedCardCanRetry
    ) {
      return NextResponse.json(
        { error: "Este pedido não está aguardando pagamento." },
        { status: 409 },
      );
    }

    const payer = {
      name: order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone,
    };
    const paymentOrder = balance ? { ...order, externalReference: order.saldoExternalReference!, chargedAmount: order.saldoTotalCobrado! } : order;
    const amountToCharge = balance ? Number(order.saldoTotalCobrado) : Number(order.chargedAmount);

    if (order.paymentMethod === MetodoPagamento.PIX) {
      const payment = await createCartMercadoPagoPixPayment({
        order: paymentOrder,
        payer,
        chargedAmount: amountToCharge,
        idempotencySuffix: expiredPixCanRetry
          ? order.mercadoPagoPaymentId || "expired"
          : undefined,
      });
      const status = getOrderStatusFromMercadoPagoStatus(payment.status);

      await applyCartOrderPayment({
        id: payment.id,
        status: payment.status,
        external_reference: paymentOrder.externalReference,
      });

      await prisma.order.update({
        where: { id: order.id },
        data: {
          mercadoPagoId: String(payment.id),
          mercadoPagoPaymentId: String(payment.id),
          mercadoPagoStatusDetail: payment.statusDetail,
          pixQrCode: payment.qrCode,
          pixQrCodeBase64: payment.qrCodeBase64,
          pixExpirationDate: payment.expirationDate
            ? new Date(payment.expirationDate)
            : null,
        },
      });

      return NextResponse.json({
        orderId: order.id,
        externalReference: paymentOrder.externalReference,
        status,
        paymentStatus: payment.status,
        statusDetail: payment.statusDetail,
        pix: {
          qrCode: payment.qrCode,
          qrCodeBase64: payment.qrCodeBase64,
          expirationDate: payment.expirationDate,
        },
      });
    }

    if (
      order.paymentMethod !== MetodoPagamento.CARTAO_CREDITO &&
      order.paymentMethod !== MetodoPagamento.CARTAO_DEBITO
    ) {
      return NextResponse.json(
        { error: "Forma de pagamento indisponível no Checkout Transparente." },
        { status: 400 },
      );
    }

    const body = cardPaymentSchema.parse(await req.json().catch(() => ({})));
    const payment = await createCartMercadoPagoCardPayment({
      order: paymentOrder,
      payer: {
        ...payer,
        email: body.payer.email,
        identification: body.payer.identification,
      },
      chargedAmount: amountToCharge,
      token: body.token,
      paymentMethodId: body.payment_method_id,
      issuerId: body.issuer_id,
      installments: body.installments,
    });
    const status = getOrderStatusFromMercadoPagoStatus(payment.status);

    await applyCartOrderPayment({
      id: payment.id,
      status: payment.status,
      external_reference: paymentOrder.externalReference,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        mercadoPagoId: String(payment.id),
        mercadoPagoPaymentId: String(payment.id),
        mercadoPagoStatusDetail: payment.statusDetail,
        customerEmail: body.payer.email,
      },
    });

    return NextResponse.json({
      orderId: order.id,
      externalReference: paymentOrder.externalReference,
      status,
      paymentStatus: payment.status,
      statusDetail: payment.statusDetail,
      message:
        payment.status === "rejected"
          ? getMercadoPagoPaymentStatusMessage(payment.statusDetail)
          : null,
    });
  } catch (error) {
    console.error("POST /api/checkout/cart/[orderId]/pay error", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Dados do pagamento invalidos." },
        { status: 400 },
      );
    }

    if (error instanceof MercadoPagoApiError) {
      return NextResponse.json(
        { error: getMercadoPagoErrorMessage(error) },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: "Não foi possível processar o pagamento." },
      { status: 500 },
    );
  }
}
