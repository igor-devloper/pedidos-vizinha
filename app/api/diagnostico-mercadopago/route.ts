import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();

  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: "MERCADO_PAGO_ACCESS_TOKEN não configurado.",
      },
      { status: 500 },
    );
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const [userResponse, methodsResponse] = await Promise.all([
    fetch("https://api.mercadopago.com/users/me", {
      headers,
      cache: "no-store",
    }),
    fetch("https://api.mercadopago.com/v1/payment_methods", {
      headers,
      cache: "no-store",
    }),
  ]);

  const userData = await userResponse.json().catch(() => null);
  const methodsData = await methodsResponse.json().catch(() => null);

  return NextResponse.json({
    ok: userResponse.ok && methodsResponse.ok,

    token: {
      configured: true,
      prefix: token.slice(0, 8),
      length: token.length,
    },

    usersMe: {
      status: userResponse.status,
      ok: userResponse.ok,
      data: userData,
    },

    paymentMethods: {
      status: methodsResponse.status,
      ok: methodsResponse.ok,
      data: methodsData,
    },
  });
}