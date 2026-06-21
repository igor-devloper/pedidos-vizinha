import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { getCurrentCart, serializeCart, setCartSessionCookie } from "@/lib/cart";
import { prisma } from "@/lib/db";
import { createCartMercadoPagoPreference } from "@/lib/mercado-pago";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
    };
    const { cart, isNew, sessionId } = await getCurrentCart();
    const snapshot = serializeCart(cart);

    if (snapshot.items.length === 0) {
      return NextResponse.json({ error: "Carrinho vazio." }, { status: 400 });
    }

    const externalReference = `cart-${randomUUID()}`;

    const order = await prisma.order.create({
      data: {
        cartId: cart.id,
        externalReference,
        customerName: body.customerName?.trim() || null,
        customerEmail: body.customerEmail?.trim() || null,
        customerPhone: body.customerPhone?.trim() || null,
        totalAmount: snapshot.totalAmount,
        items: {
          create: cart.items.map((item) => {
            const unitPrice = Number(item.unitPrice);
            const subtotal = unitPrice * item.quantity;

            return {
              productId: item.productId,
              productName: item.product.nome,
              productType: item.product.productType?.name || String(item.product.categoria),
              quantity: item.quantity,
              unitPrice,
              subtotal,
            };
          }),
        },
      },
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
    return NextResponse.json({ error: "Erro ao finalizar carrinho." }, { status: 500 });
  }
}
