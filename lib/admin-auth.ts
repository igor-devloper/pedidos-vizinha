import { createHash, timingSafeEqual } from "crypto";

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const MANHIA_COOKIE_NAME = "manhia_session";

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

export function getManhiaPassword() {
  return process.env.MANHIA_ACCESS_PASSWORD?.trim() || "";
}

export function createManhiaSessionToken(password: string) {
  return hashValue(`manhia:${password}`);
}

export function isValidManhiaPassword(password: string) {
  const configuredPassword = getManhiaPassword();

  if (!configuredPassword) {
    return false;
  }

  return safeEqual(
    createManhiaSessionToken(password),
    createManhiaSessionToken(configuredPassword)
  );
}

export function isValidManhiaSessionToken(token?: string) {
  const configuredPassword = getManhiaPassword();

  if (!configuredPassword || !token) {
    return false;
  }

  return safeEqual(token, createManhiaSessionToken(configuredPassword));
}

export async function isManhiaAuthenticated() {
  const cookieStore = await cookies();
  const token = cookieStore.get(MANHIA_COOKIE_NAME)?.value;
  return isValidManhiaSessionToken(token);
}

export function isManhiaRequestAuthenticated(req: Request | NextRequest) {
  const header = req.headers.get("cookie") || "";
  const token =
    header
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${MANHIA_COOKIE_NAME}=`))
      ?.split("=")[1] || "";

  return isValidManhiaSessionToken(token);
}
