import {
  probeDevsFireConnect,
  toErrorMessage,
} from "@/mastra/tools/devsFire/_client";
import { errorEnvelope, successEnvelope } from "@/lib/devsfire/envelope";
import { DevsFireError } from "@/lib/devsfire/errors";

export const runtime = "nodejs";
export const maxDuration = 360;

function getBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const token = match[1]?.trim();
  return token || null;
}

export async function GET(request: Request) {
  const expectedToken = process.env.DEVS_FIRE_DIAGNOSTICS_KEY?.trim();
  if (!expectedToken) {
    return errorEnvelope(
      request,
      new DevsFireError({
        type: "UnknownError",
        message:
          "DEVS_FIRE_DIAGNOSTICS_KEY is not configured. Set it to enable diagnostics endpoint access.",
        status: 500,
      }),
    );
  }

  const providedToken = getBearerToken(request.headers.get("authorization"));
  if (!providedToken) {
    return errorEnvelope(
      request,
      new DevsFireError({
        type: "SimulationError",
        message: "Missing Authorization bearer token.",
        status: 401,
      }),
    );
  }

  if (providedToken !== expectedToken) {
    return errorEnvelope(
      request,
      new DevsFireError({
        type: "SimulationError",
        message: "Invalid diagnostics token.",
        status: 403,
      }),
    );
  }

  try {
    const diagnostics = await probeDevsFireConnect();
    return successEnvelope(request, diagnostics);
  } catch (error) {
    return errorEnvelope(
      request,
      new DevsFireError({
        type: "UnknownError",
        message: toErrorMessage(error),
        status: 500,
      }),
    );
  }
}
