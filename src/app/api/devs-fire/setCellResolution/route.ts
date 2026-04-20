import { z } from "zod";

import { setCellResolution } from "@/lib/devsfire/endpoints";
import {
  ensureAuthedUser,
  parseJsonBody,
  requireSessionToken,
  withRouteEnvelope,
} from "@/lib/devsfire/routeHandlers";

const bodySchema = z.object({
  cellResolution: z.coerce.number().positive(),
  cellDimension: z.coerce.number().int().positive(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withRouteEnvelope(request, async () => {
    await ensureAuthedUser();
    const userToken = requireSessionToken(request);
    const body = await parseJsonBody(request, bodySchema);
    await setCellResolution({ userToken, ...body });
    return { updated: true };
  });
}
