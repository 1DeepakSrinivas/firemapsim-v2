import { z } from "zod";

import { setMultiParameters } from "@/lib/devsfire/endpoints";
import {
  ensureAuthedUser,
  parseJsonBody,
  requireSessionToken,
  withRouteEnvelope,
} from "@/lib/devsfire/routeHandlers";

const bodySchema = z
  .object({
    x: z.coerce.number().int().optional(),
    y: z.coerce.number().int().optional(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    windSpeed: z.coerce.number().optional(),
    windDirection: z.coerce.number().optional(),
    cellResolution: z.coerce.number().int().optional(),
    cellDimension: z.coerce.number().int().optional(),
  })
  .strict();

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withRouteEnvelope(request, async () => {
    await ensureAuthedUser();
    const userToken = requireSessionToken(request);
    const body = await parseJsonBody(request, bodySchema);
    await setMultiParameters({ userToken, ...body });
    return { updated: true };
  });
}
