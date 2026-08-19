import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();

  if (!token) {
    return NextResponse.json({
      configured: false,
    });
  }

  const response = await fetch("https://api.mercadolibre.com/users/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  return NextResponse.json({
    configured: true,
    tokenPrefix: token.slice(0, 8),
    tokenLength: token.length,
    mercadoPagoStatus: response.status,
    mercadoPagoResponse: data,
  });
}