import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { errorEnvelope, successEnvelope } from "@/lib/devsfire/envelope";
import { DevsFireError } from "@/lib/devsfire/errors";
import { getSessionTokenFromRequest } from "@/lib/devsfire/session";

export async function ensureAuthedUser() {
  const { userId } = await auth();
  if (!userId) {
    throw new DevsFireError({
      type: "SimulationError",
      message: "Unauthorized",
      status: 401,
    });
  }
  return userId;
}

export function requireSessionToken(request: Request): string {
  const token = getSessionTokenFromRequest(request);
  if (!token) {
    throw new DevsFireError({
      type: "SimulationError",
      message: "No active DEVS-FIRE session. Call connectToServer first.",
      status: 401,
    });
  }
  return token;
}

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new DevsFireError({
      type: "SimulationError",
      message: "Invalid JSON request body.",
      status: 400,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new DevsFireError({
      type: "SimulationError",
      message: "Invalid request payload.",
      details: parsed.error.message,
      status: 400,
    });
  }

  return parsed.data;
}

export async function withRouteEnvelope<T>(
  request: Request,
  action: () => Promise<T>,
) {
  try {
    const data = await action();
    return successEnvelope(request, data);
  } catch (error) {
    return errorEnvelope(request, error);
  }
}
