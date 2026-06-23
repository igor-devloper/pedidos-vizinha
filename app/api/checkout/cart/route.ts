import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { MetodoPagamento, Prisma } from "@prisma/client";

import {
  getCartProductUnitPrice,
  getCurrentCart,
  normalizeCartSelectedItems,
  serializeCart,
  setCartSessionCookie,
} from "@/lib/cart";
import { prisma } from "@/lib/db";
import { createCartMercadoPagoPreference } from "@/lib/mercado-pago";
import {
  calculatePaymentAmounts,
  validatePedidoAgainstProduto,
} from "@/lib/pedidos";
import { getProdutoComboItens } from "@/lib/produtos";

function parseSaoPauloScheduledAt(value?: string) {
  if (!value) return null;

  // Quando vier só "YYYY-MM-DDTHH:mm", esse horário é local de Brasília/São Paulo.
  // Sem o offset, o Node interpreta no fuso do servidor e pode salvar 3h errado.
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
    ? value
    : `${value.length === 16 ? `${value}:00` : value}-03:00`;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      paymentPercentage?: number;
      paymentMethod?: MetodoPagamento;
      scheduledAt?: string;
    };
    const { cart, isNew, sessionId } = await getCurrentCart();
    const snapshot = serializeCart(cart);

    if (snapshot.items.length === 0) {
      return NextResponse.json({ error: "Carrinho vazio." }, { status: 400 });
    }

    const paymentPercentage = body.paymentPercentage === 50 ? 50 : 100;
    const paymentMethod = Object.values(MetodoPagamento).includes(
      body.paymentMethod as MetodoPagamento,
    )
      ? (body.paymentMethod as MetodoPagamento)
      : MetodoPagamento.PIX;
    const allowsPartial = cart.items.every(
      (item) => item.product.permitePagamentoParcial,
    );

    if (paymentPercentage === 50 && !allowsPartial) {
      return NextResponse.json(
        { error: "Um dos produtos do carrinho exige pagamento integral." },
        { status: 400 },
      );
    }

    for (const item of cart.items) {
      const selectedItems = normalizeCartSelectedItems(
        item.selectedItems,
      ).filter((entry) => entry.quantidade > 0);

      validatePedidoAgainstProduto(
        {
          ...item.product,
          comboItens: getProdutoComboItens(
            item.product as { comboItens?: unknown },
          ),
        },
        selectedItems,
        item.quantity,
      );
    }

    const scheduledAt = parseSaoPauloScheduledAt(body.scheduledAt);

    if (!scheduledAt) {
      return NextResponse.json(
        { error: "Informe uma data e horario validos." },
        { status: 400 },
      );
    }

    const payment = calculatePaymentAmounts(
      snapshot.totalAmount,
      paymentPercentage,
      paymentMethod,
    );
    const orderCode = `C${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 4).toUpperCase()}`;
    const externalReference = `cart-${orderCode}`;

    const order = await prisma.order.create({
      data: {
        cartId: cart.id,
        externalReference,
        code: orderCode,
        scheduledAt,
        customerName: body.customerName?.trim() || null,
        customerEmail: body.customerEmail?.trim() || null,
        customerPhone: body.customerPhone?.trim() || null,
        totalAmount: snapshot.totalAmount,
        paymentPercentage,
        paymentMethod,
        paymentMethodLabel: payment.methodLabel,
        feePercent: payment.feePercent,
        feeAmount: payment.feeAmount,
        chargedAmount: payment.totalToCharge,
        items: {
          create: cart.items.map((item) => {
            const unitPrice = getCartProductUnitPrice(item.product);
            const subtotal = unitPrice * item.quantity;
            const selectedItems = normalizeCartSelectedItems(
              item.selectedItems,
            ).filter((entry) => entry.quantidade > 0);

            return {
              productId: item.productId,
              productName: item.product.nome,
              productType:
                item.product.productType?.name ||
                String(item.product.categoria),
              quantity: item.quantity,
              unitPrice,
              subtotal,
              selectedItems,
            };
          }),
        },
      } as Prisma.OrderUncheckedCreateInput,
      include: { items: true },
    });

    const preference = await createCartMercadoPagoPreference({
      order,
      payer: {
        name: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
      },
      items: order.items.map((item) => ({
        id: item.productId,
        title: `${item.productName} (${item.productType})`,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      paymentMethod,
      chargedAmount: payment.totalToCharge,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        mercadoPagoId: preference.id,
        mercadoPagoPreferenceId: preference.id,
        mercadoPagoInitPoint: preference.init_point,
      },
    });

    const response = NextResponse.json({
      orderId: order.id,
      preferenceId: preference.id,
      redirectUrl: preference.init_point,
    });

    if (isNew) {
      setCartSessionCookie(response, sessionId);
    }

    return response;
  } catch (error) {
    console.error("POST /api/checkout/cart error", error);
    return NextResponse.json(
      { error: "Erro ao finalizar carrinho." },
      { status: 500 },
    );
  }
}
