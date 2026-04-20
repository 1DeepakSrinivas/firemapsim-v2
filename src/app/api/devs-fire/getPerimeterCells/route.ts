import { getPerimeterCells } from "@/lib/devsfire/endpoints";
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
    const perimeterCells = await getPerimeterCells({ userToken });
    return { perimeterCells };
  });
}

export async function GET(request: Request) {
  return POST(request);
}
