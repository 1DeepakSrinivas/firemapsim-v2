import { getUnburnedCellNum } from "@/lib/devsfire/endpoints";
import {
  ensureAuthedUser,
  requireSessionToken,
  withRouteEnvelope,
} from "@/lib/devsfire/routeHandlers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withRouteEnvelope(request, async () => {
    await ensureAuthedUser();
    const userToken = requireSessionToken(request);
    const unburnedCellNum = await getUnburnedCellNum({ userToken });
    return { unburnedCellNum };
  });
}

export async function GET(request: Request) {
  return POST(request);
}
