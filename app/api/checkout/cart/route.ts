import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { MetodoPagamento, OrderStatus, PedidoStatus, Prisma } from "@prisma/client";

import {
  getCartProductUnitPrice,
  getCurrentCart,
  normalizeCartSelectedItems,
  serializeCart,
  setCartSessionCookie,
} from "@/lib/cart";
import { getFullStoreStatus, isSameBusinessDate } from "@/lib/business-hours";
import { prisma } from "@/lib/db";
import {
  calculatePaymentAmounts,
  validateDeliveryDate,
  validatePedidoAgainstProduto,
} from "@/lib/pedidos";
import { getProdutoComboItens } from "@/lib/produtos";
import { getDeliveryFee, type FulfillmentType } from "@/lib/delivery";

function parseLocalScheduledAt(value?: string) {
  if (!value) return null;

  // O datetime-local do front vem como "YYYY-MM-DDTHH:mm".
  // Para o banco manter exatamente o horário escolhido, salvamos esse horário
  // como UTC "fixo", sem aplicar conversão de fuso (+3h).
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );

  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const [, year, month, day, hour, minute, second = "00"] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function fixedUtcLocalToBusinessDate(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const localIso = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(
    value.getUTCDate(),
  )}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(
    value.getUTCSeconds(),
  )}-03:00`;

  return new Date(localIso);
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
      fulfillmentType?: FulfillmentType;
      deliveryAddress?: string;
      deliveryReference?: string;
      deliveryNeighborhood?: string;
      deliveryCity?: string;
      deliveryPlaceId?: string;
      deliveryLatitude?: number;
      deliveryLongitude?: number;
    };
    const { cart, isNew, sessionId } = await getCurrentCart();
    const snapshot = serializeCart(cart);

    if (snapshot.items.length === 0) {
      return NextResponse.json({ error: "Carrinho vazio." }, { status: 400 });
    }

    const customerName = body.customerName?.trim() || "";
    const customerEmail = body.customerEmail?.trim() || "";
    const customerPhone = body.customerPhone?.trim() || "";
    const fulfillmentType: FulfillmentType = body.fulfillmentType === "DELIVERY" ? "DELIVERY" : "PICKUP";
    const deliveryAddress = body.deliveryAddress?.trim() || "";
    const deliveryReference = body.deliveryReference?.trim() || "";
    const deliveryNeighborhood = body.deliveryNeighborhood?.trim() || "";
    const deliveryCity = body.deliveryCity?.trim() || "";

    if (fulfillmentType === "DELIVERY" && (!deliveryAddress || !body.deliveryPlaceId || !deliveryNeighborhood)) {
      return NextResponse.json({ error: "Selecione um endereço válido nas sugestões do Google Maps." }, { status: 400 });
    }
    if (fulfillmentType === "DELIVERY" && deliveryReference.length < 3) {
      return NextResponse.json({ error: "Informe um ponto de referência para o entregador." }, { status: 400 });
    }

    const delivery = fulfillmentType === "DELIVERY"
      ? getDeliveryFee(deliveryNeighborhood)
      : { fee: 0, label: "Retirada", agreed: true };
    const orderTotal = Number((snapshot.totalAmount + delivery.fee).toFixed(2));

    if (customerName.length < 2) {
      return NextResponse.json(
        { error: "Informe o nome para finalizar o pedido." },
        { status: 400 },
      );
    }

    if (customerPhone.replace(/\D/g, "").length < 10) {
      return NextResponse.json(
        { error: "Informe um WhatsApp válido para finalizar o pedido." },
        { status: 400 },
      );
    }

    if (!/^\S+@\S+\.\S+$/.test(customerEmail)) {
      return NextResponse.json(
        { error: "Informe um e-mail válido para o pagamento." },
        { status: 400 },
      );
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

    const scheduledAt = parseLocalScheduledAt(body.scheduledAt);

    if (!scheduledAt) {
      return NextResponse.json(
        { error: "Informe uma data e horário válidos." },
        { status: 400 },
      );
    }

    const settings = await getFullStoreStatus();
    const scheduledAtForRules = fixedUtcLocalToBusinessDate(scheduledAt);

    if (!settings.isOpen && isSameBusinessDate(scheduledAtForRules, new Date())) {
      return NextResponse.json(
        {
          error:
            "A loja está fechada para pedidos de hoje. Escolha uma data futura para continuar.",
        },
        { status: 400 },
      );
    }

    validateDeliveryDate(scheduledAtForRules, new Date(), settings.minimumLeadHours, {
      operationSchedule: settings.operationSchedule,
    });

    if (!settings.allowMultipleOrdersPerSlot) {
      const [conflictingPedido, conflictingOrder] = await Promise.all([
        prisma.pedido.findFirst({
          where: {
            dataEntrega: scheduledAtForRules,
            status: { not: PedidoStatus.CANCELADO },
          },
          select: { id: true, codigo: true },
        }),
        prisma.order.findFirst({
          where: {
            scheduledAt,
            status: { not: OrderStatus.CANCELLED },
          },
          select: { id: true, code: true },
        }),
      ]);

      if (conflictingPedido || conflictingOrder) {
        return NextResponse.json(
          {
            error:
              "Esse horário já está reservado para outro pedido. Escolha outro horário para continuar.",
          },
          { status: 409 },
        );
      }
    }

    const payment = calculatePaymentAmounts(
      orderTotal,
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
        customerName,
        customerEmail,
        customerPhone,
        totalAmount: orderTotal,
        fulfillmentType,
        deliveryAddress: fulfillmentType === "DELIVERY" ? deliveryAddress : null,
        deliveryReference: fulfillmentType === "DELIVERY" ? deliveryReference : null,
        deliveryNeighborhood: fulfillmentType === "DELIVERY" ? deliveryNeighborhood : null,
        deliveryCity: fulfillmentType === "DELIVERY" ? deliveryCity : null,
        deliveryPlaceId: fulfillmentType === "DELIVERY" ? body.deliveryPlaceId : null,
        deliveryLatitude: fulfillmentType === "DELIVERY" ? body.deliveryLatitude : null,
        deliveryLongitude: fulfillmentType === "DELIVERY" ? body.deliveryLongitude : null,
        deliveryMapsUrl: fulfillmentType === "DELIVERY" ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deliveryAddress)}&query_place_id=${encodeURIComponent(body.deliveryPlaceId || "")}` : null,
        deliveryFee: delivery.fee,
        deliveryFeeAgreed: delivery.agreed,
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

    const response = NextResponse.json({
      orderId: order.id,
      externalReference: order.externalReference,
      paymentMethod,
      chargedAmount: payment.totalToCharge,
    });

    if (isNew) {
      setCartSessionCookie(response, sessionId);
    }

    return response;
  } catch (error) {
    console.error("POST /api/checkout/cart error", error);
    const message =
      error instanceof Error ? error.message : "Erro ao finalizar carrinho.";

    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }
}
