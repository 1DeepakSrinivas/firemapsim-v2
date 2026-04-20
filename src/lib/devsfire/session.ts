import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { DEVS_FIRE_SESSION_COOKIE_NAME } from "@/lib/devsfire/config";
import { DevsFireError } from "@/lib/devsfire/errors";

const SESSION_TTL_SECONDS = 12 * 60 * 60;

type SessionPayload = {
  token: string;
  iat: number;
  exp: number;
};

function toBase64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function getSessionKey(): Buffer {
  const secret =
    process.env.DEVS_FIRE_SESSION_SECRET?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) {
    throw new DevsFireError({
      type: "UnknownError",
      message: "DEVS_FIRE_SESSION_SECRET is not configured.",
    });
  }
  return createHash("sha256").update(secret).digest();
}

function encryptPayload(payload: SessionPayload): string {
  const key = getSessionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [toBase64Url(iv), toBase64Url(tag), toBase64Url(encrypted)].join(".");
}

function decryptPayload(token: string): SessionPayload {
  const [ivRaw, tagRaw, encryptedRaw] = token.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new DevsFireError({
      type: "UnknownError",
      message: "Invalid DEVS-FIRE session cookie format.",
    });
  }

  const key = getSessionKey();
  const iv = fromBase64Url(ivRaw);
  const tag = fromBase64Url(tagRaw);
  const encrypted = fromBase64Url(encryptedRaw);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const parsed = JSON.parse(plain.toString("utf8")) as SessionPayload;
  return parsed;
}

function parseCookieHeader(request: Request): Record<string, string> {
  const raw = request.headers.get("cookie");
  if (!raw) return {};

  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!name || rest.length === 0) continue;
    out[name] = rest.join("=");
  }
  return out;
}

export function getSessionTokenFromRequest(request: Request): string | null {
  const cookies = parseCookieHeader(request);
  const cookie = cookies[DEVS_FIRE_SESSION_COOKIE_NAME];
  if (!cookie) {
    return null;
  }

  try {
    const payload = decryptPayload(cookie);
    const now = Math.floor(Date.now() / 1000);
    if (!payload.token || payload.exp <= now) {
      return null;
    }
    return payload.token;
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, upstreamToken: string): void {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    token: upstreamToken,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const encoded = encryptPayload(payload);

  response.cookies.set({
    name: DEVS_FIRE_SESSION_COOKIE_NAME,
    value: encoded,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: DEVS_FIRE_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
