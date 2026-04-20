import { z } from "zod";

import { setDynamicIgnition } from "@/lib/devsfire/endpoints";
import {
  ensureAuthedUser,
  parseJsonBody,
  requireSessionToken,
  withRouteEnvelope,
} from "@/lib/devsfire/routeHandlers";

const bodySchema = z.object({
  teamNum: z.string().min(1),
  x1: z.coerce.number(),
  y1: z.coerce.number(),
  x2: z.coerce.number(),
  y2: z.coerce.number(),
  speed: z.coerce.number(),
  mode: z.string().optional(),
  distance: z.coerce.number().optional(),
  waitTime: z.coerce.number().optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withRouteEnvelope(request, async () => {
    await ensureAuthedUser();
    const userToken = requireSessionToken(request);
    const body = await parseJsonBody(request, bodySchema);
    await setDynamicIgnition({ userToken, ...body });
    return { updated: true };
  });
}
