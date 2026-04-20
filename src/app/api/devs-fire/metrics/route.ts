import {
  computeBurnedArea,
  computePerimeterLength,
  getBurningCellNum,
  getPerimeterCells,
  getUnburnedCellNum,
} from "@/lib/devsfire/endpoints";
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

    const [perimeterCells, burnedArea, perimeterLength, burningCellNum, unburnedCellNum] =
      await Promise.all([
        getPerimeterCells({ userToken }),
        computeBurnedArea({ userToken }),
        computePerimeterLength({ userToken }),
        getBurningCellNum({ userToken }),
        getUnburnedCellNum({ userToken }),
      ]);

    return {
      perimeterCells,
      burnedArea,
      perimeterLength,
      burningCellNum,
      unburnedCellNum,
    };
  });
}

export async function GET(request: Request) {
  return POST(request);
}
