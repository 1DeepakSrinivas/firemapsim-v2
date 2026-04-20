import { TooManyPointIgnitionsError } from "@/lib/devsFireIgnitionDispatch";
import { CoordinateOutOfBoundsError } from "@/lib/devsFireCoordinateValidation";

export type SimulationErrorShape = {
  code: string;
  message: string;
  status: number;
  details?: string;
  hint?: string;
};

export function classifySimulationError(error: unknown): SimulationErrorShape {
  const message = error instanceof Error ? error.message : "Unknown error";
  const lower = message.toLowerCase();
  const errorCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;

  if (error instanceof CoordinateOutOfBoundsError || errorCode === "coordinate_out_of_bounds") {
    return {
      code: "coordinate_out_of_bounds",
      message,
      status: 400,
      details: message,
      hint: "Adjust ignition/suppression points so all coordinates stay inside the selected boundary.",
    };
  }

  if (error instanceof TooManyPointIgnitionsError || errorCode === "too_many_point_ignitions") {
    return {
      code: "too_many_point_ignitions",
      message,
      status: 400,
      details: message,
      hint: "Reduce point ignitions or convert dense ignitions to line segments before rerunning.",
    };
  }

  if (
    lower.includes("returned html") ||
    lower.includes("connecttoserver returned html") ||
    lower.includes("<!doctype html") ||
    lower.includes("<html")
  ) {
    return {
      code: "upstream_html_response",
      message:
        "DEVS-FIRE upstream returned HTML instead of API data. This usually indicates a gateway, auth, or host/base URL mismatch.",
      status: 502,
      details: message,
      hint:
        "Verify DEVS_FIRE_BASE_URL is https://firesim.cs.gsu.edu/api, then run /api/devs-fire/smoke. Ops can run /api/devs-fire/diagnostics for per-attempt telemetry.",
    };
  }

  if (
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("abort")
  ) {
    return {
      code: "upstream_timeout",
      message:
        "DEVS-FIRE upstream timed out. Please retry shortly; if it persists, verify server availability.",
      status: 504,
      details: message,
      hint:
        "Retry once. If it keeps failing, run /api/devs-fire/smoke from the same host; for operators, use /api/devs-fire/diagnostics to identify where connect attempts stall.",
    };
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("couldn't connect") ||
    lower.includes("failed to fetch") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network")
  ) {
    return {
      code: "upstream_unreachable",
      message:
        "DEVS-FIRE upstream is unreachable from the server. Check network/firewall and DEVS_FIRE_BASE_URL.",
      status: 502,
      details: message,
      hint:
        "Check server egress/firewall and DNS from the deployment host. Run /api/devs-fire/smoke locally on that host to verify reachability.",
    };
  }

  if (lower.includes("request failed for")) {
    return {
      code: "upstream_http_error",
      message: "DEVS-FIRE upstream rejected the request with an HTTP error response.",
      status: 502,
      details: message,
      hint:
        "Run /api/devs-fire/smoke to confirm base connectivity. If smoke passes, inspect DEVS-FIRE request payload/operation inputs.",
    };
  }

  if (lower.includes("invalid") && lower.includes("response")) {
    return {
      code: "invalid_upstream_response",
      message: "DEVS-FIRE returned an invalid response payload.",
      status: 502,
      details: message,
      hint:
        "Upstream responded with an unexpected shape. Use /api/devs-fire/diagnostics to compare connect behavior and inspect raw response previews.",
    };
  }

  return {
    code: "simulation_failed",
    message,
    status: 500,
    details: message,
    hint: "Check server logs, then run /api/devs-fire/smoke to separate app issues from upstream availability.",
  };
}
