import { z } from "zod";

import { setWindCondition } from "@/lib/devsfire/endpoints";
import {
  ensureAuthedUser,
  parseJsonBody,
  requireSessionToken,
  withRouteEnvelope,
} from "@/lib/devsfire/routeHandlers";

const bodySchema = z.object({
  windSpeed: z.coerce.number().optional(),
  windDirection: z.coerce.number().optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withRouteEnvelope(request, async () => {
    await ensureAuthedUser();
    const userToken = requireSessionToken(request);
    const body = await parseJsonBody(request, bodySchema);
    await setWindCondition({ userToken, ...body });
    return { updated: true };
  });
}
