import { z } from "zod";

import { errorEnvelope, successEnvelope } from "@/lib/devsfire/envelope";
import { connectToServer } from "@/lib/devsfire/endpoints";
import { devsFireRequest } from "@/lib/devsfire/httpClient";
import { DevsFireError } from "@/lib/devsfire/errors";
import { ensureAuthedUser, requireSessionToken } from "@/lib/devsfire/routeHandlers";
import { setSessionCookie } from "@/lib/devsfire/session";

export const runtime = "nodejs";
export const maxDuration = 360;

const queryValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const requestSchema = z.object({
  path: z.string().min(1),
  params: z.record(z.string(), queryValueSchema).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

function normalizePath(path: string): string {
  if (!path.startsWith("/")) {
    return `/${path}`;
  }
  return path;
}

function isConnectPath(path: string): boolean {
  const normalized = normalizePath(path).replace(/\/+$/, "");
  return normalized === "/connectToServer";
}

export async function POST(request: Request) {
  try {
    await ensureAuthedUser();
    const body = requestSchema.parse(await request.json());
    const path = normalizePath(body.path);

    if (isConnectPath(path)) {
      const { token } = await connectToServer();
      const response = successEnvelope(request, { connected: true });
      setSessionCookie(response, token);
      return response;
    }

    const userToken = requireSessionToken(request);
    const data = await devsFireRequest({
      endpoint: path,
      userToken,
      query: body.params,
      body: body.body,
      headers: body.headers,
    });

    return successEnvelope(request, { data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorEnvelope(
        request,
        new DevsFireError({
          type: "SimulationError",
          message: "Invalid request payload.",
          details: error.message,
          status: 400,
        }),
      );
    }
    return errorEnvelope(request, error);
  }
}

export async function GET(request: Request) {
  return errorEnvelope(
    request,
    new DevsFireError({
      type: "SimulationError",
      message: "Use POST for DEVS-FIRE proxy requests.",
      status: 405,
    }),
    405,
  );
}
