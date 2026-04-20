import { describe, expect, test } from "bun:test";

import { TooManyPointIgnitionsError } from "@/lib/devsFireIgnitionDispatch";
import { classifySimulationError } from "@/lib/api/simulationErrors";

describe("classifySimulationError", () => {
  test("returns structured 400 for too many point ignitions", () => {
    const classified = classifySimulationError(new TooManyPointIgnitionsError(201));
    expect(classified).toMatchObject({
      code: "too_many_point_ignitions",
      status: 400,
    });
    expect(classified.message).toContain("Too many point ignitions");
  });

  test("classifies HTTP upstream errors with endpoint context in details", () => {
    const classified = classifySimulationError(
      new Error(
        "DEVS-FIRE request failed for /runSimulation/: 500 Internal Server Error",
      ),
    );
    expect(classified).toMatchObject({
      code: "upstream_http_error",
      status: 502,
    });
    expect(classified.details).toContain("/runSimulation/");
    expect(classified.hint).toContain("/api/devs-fire/smoke");
  });

  test("classifies timeout errors as upstream_timeout with endpoint detail", () => {
    const classified = classifySimulationError(
      new Error("DEVS-FIRE request timed out after 180s for /runSimulation/"),
    );
    expect(classified).toMatchObject({
      code: "upstream_timeout",
      status: 504,
    });
    expect(classified.details).toContain("/runSimulation/");
    expect(classified.hint).toContain("/api/devs-fire/smoke");
  });

  test("classifies HTML payload errors as upstream_html_response", () => {
    const classified = classifySimulationError(
      new Error(
        "DEVS-FIRE connectToServer returned HTML instead of a token. Check DEVS_FIRE_BASE_URL (expected https://firesim.cs.gsu.edu/api).",
      ),
    );
    expect(classified).toMatchObject({
      code: "upstream_html_response",
      status: 502,
    });
    expect(classified.hint).toContain("/api/devs-fire/diagnostics");
  });
});
