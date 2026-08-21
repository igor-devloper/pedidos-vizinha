import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  amount: z.coerce.number().positive(),
  email: z.string().trim().email(),
});

export async function POST(req: Request) {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();

  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: "MERCADO_PAGO_ACCESS_TOKEN não configurado.",
      },
      { status: 500 }
    );
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message || "Dados inválidos.",
      },
      { status: 400 }
    );
  }

  const idempotencyKey = `diag-pix-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const payload = {
    transaction_amount: parsed.data.amount,
    payment_method_id: "pix",
    payer: {
      email: parsed.data.email,
    },
  };

  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);
  const requestId = response.headers.get("x-request-id");

  return NextResponse.json(
    {
      ok: response.ok,
      status: response.status,
      requestId,
      idempotencyKey,
      payload,
      response: data,
    },
    { status: response.ok ? 200 : response.status }
  );
}
