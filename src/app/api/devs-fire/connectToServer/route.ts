import { NextResponse } from "next/server";

import { successEnvelope, errorEnvelope } from "@/lib/devsfire/envelope";
import { connectToServer } from "@/lib/devsfire/endpoints";
import { ensureAuthedUser } from "@/lib/devsfire/routeHandlers";
import { setSessionCookie } from "@/lib/devsfire/session";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await ensureAuthedUser();
    const { token } = await connectToServer();
    const response = successEnvelope(request, { connected: true });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return errorEnvelope(request, error);
  }
}

export async function GET(request: Request) {
  return POST(request);
}
