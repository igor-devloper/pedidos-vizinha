import { NextResponse } from "next/server";

import {
  createManhiaSessionToken,
  getManhiaPassword,
  isValidManhiaPassword,
  MANHIA_COOKIE_NAME,
} from "@/lib/admin-auth";

export async function POST(req: Request) {
  try {
    const configuredPassword = getManhiaPassword();

    if (!configuredPassword) {
      return NextResponse.json(
        {
          error:
            "Senha do painel nao configurada. Defina MANHIA_ACCESS_PASSWORD no ambiente.",
        },
        { status: 500 }
      );
    }

    const body = (await req.json()) as { password?: string };
    const password = body.password?.trim() || "";

    if (!isValidManhiaPassword(password)) {
      return NextResponse.json({ error: "Senha invalida." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(MANHIA_COOKIE_NAME, createManhiaSessionToken(password), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch (error) {
    console.error("POST /api/manhia/login error", error);
    return NextResponse.json(
      { error: "Erro ao autenticar." },
      { status: 500 }
    );
  }
}
