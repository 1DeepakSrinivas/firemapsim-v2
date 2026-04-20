import { DEVS_FIRE_BASE_URL } from "@/lib/devsfire/config";
import { errorEnvelope, successEnvelope } from "@/lib/devsfire/envelope";
import { connectToServer } from "@/lib/devsfire/endpoints";
import { ensureAuthedUser } from "@/lib/devsfire/routeHandlers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    await ensureAuthedUser();
    const connectStartedAt = Date.now();
    const { token } = await connectToServer();
    return successEnvelope(request, {
      baseUrl: DEVS_FIRE_BASE_URL,
      stage: "connect",
      latencyMs: Date.now() - connectStartedAt,
      totalMs: Date.now() - startedAt,
      tokenLength: token.length,
      tokenPreview: `${token.slice(0, 8)}...`,
    });
  } catch (error) {
    return errorEnvelope(request, error);
  }
}
