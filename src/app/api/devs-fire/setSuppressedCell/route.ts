import { z } from "zod";

import { setSuppressedCell } from "@/lib/devsfire/endpoints";
import {
  ensureAuthedUser,
  parseJsonBody,
  requireSessionToken,
  withRouteEnvelope,
} from "@/lib/devsfire/routeHandlers";

const bodySchema = z.object({
  x1: z.coerce.number(),
  y1: z.coerce.number(),
  x2: z.coerce.number().optional(),
  y2: z.coerce.number().optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withRouteEnvelope(request, async () => {
    await ensureAuthedUser();
    const userToken = requireSessionToken(request);
    const body = await parseJsonBody(request, bodySchema);
    await setSuppressedCell({ userToken, ...body });
    return { updated: true };
  });
}
