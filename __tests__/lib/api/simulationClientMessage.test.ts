import { describe, expect, test } from "bun:test";

import { formatSimulationRunFailureMessage } from "@/lib/api/simulationClientMessage";

describe("formatSimulationRunFailureMessage", () => {
  test("prefers hint when available", () => {
    const message = formatSimulationRunFailureMessage(504, {
      code: "upstream_timeout",
      error: "DEVS-FIRE upstream timed out.",
      details: "DEVS-FIRE request timed out after 180s for /runSimulation/",
      hint: "Run /api/devs-fire/smoke from this host.",
    });

    expect(message).toContain("DEVS-FIRE upstream timed out.");
    expect(message).toContain("(HTTP 504)");
    expect(message).toContain("Hint: Run /api/devs-fire/smoke from this host.");
  });

  test("falls back to details when hint missing", () => {
    const message = formatSimulationRunFailureMessage(502, {
      code: "upstream_http_error",
      error: "DEVS-FIRE upstream rejected the request.",
      details: "DEVS-FIRE request failed for /runSimulation/: 500 Internal Server Error",
    });

    expect(message).toContain("DEVS-FIRE upstream rejected the request.");
    expect(message).toContain("/runSimulation/");
  });
});
