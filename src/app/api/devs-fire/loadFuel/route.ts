import { z } from "zod";

import { loadFuel } from "@/lib/devsfire/endpoints";
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
    const userToken = requireSessionToken(request);
    const body = await parseJsonBody(request, bodySchema);
    await loadFuel({ userToken, ...body });
    return { updated: true };
  });
}
