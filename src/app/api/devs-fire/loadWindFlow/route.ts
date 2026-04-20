import { z } from "zod";

import { DEVS_FIRE_WIND_FLOW_ENABLED } from "@/lib/devsfire/config";
import { DevsFireError } from "@/lib/devsfire/errors";
import { loadWindFlow } from "@/lib/devsfire/endpoints";
import {
  ensureAuthedUser,
  parseJsonBody,
  requireSessionToken,
  withRouteEnvelope,
} from "@/lib/devsfire/routeHandlers";

const bodySchema = z.object({
  fileContent: z.string(),
  fileName: z.string().min(1),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withRouteEnvelope(request, async () => {
    await ensureAuthedUser();

    if (!DEVS_FIRE_WIND_FLOW_ENABLED) {
      throw new DevsFireError({
        type: "SimulationError",
        message: "loadWindFlow is disabled by feature flag.",
        status: 501,
      });
    }

    const userToken = requireSessionToken(request);
    const body = await parseJsonBody(request, bodySchema);
    await loadWindFlow({ userToken, ...body });
    return { updated: true };
  });
}
