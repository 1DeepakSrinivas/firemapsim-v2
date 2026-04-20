import { describe, expect, mock, test } from "bun:test";

const createFireSimAgent = mock(() => ({ id: "firesim-agent" }));
const simulateWorkflow = { id: "simulate-workflow" };
const mastraConstructor = mock((_options: unknown) => undefined);

class FakeMastra {
  options: Record<string, unknown>;

  constructor(options: Record<string, unknown>) {
    mastraConstructor(options);
    this.options = options;
  }
}

class FakeConsoleLogger {
  constructor(_config: unknown) {}
}

mock.module("@mastra/core/mastra", () => ({
  Mastra: FakeMastra,
}));

mock.module("@mastra/core/logger", () => ({
  ConsoleLogger: FakeConsoleLogger,
}));

mock.module("@/mastra/agents/firesim-agent", () => ({
  createFireSimAgent,
}));

mock.module("@/mastra/workflows/simulate", () => ({
  simulateWorkflow,
}));

async function loadMastraModule() {
  return import("@/mastra");
}

describe("Mastra bootstrap", () => {
  test("initializes lazily and keeps a singleton instance", async () => {
    const moduleRef = await loadMastraModule();

    expect(mastraConstructor).toHaveBeenCalledTimes(0);

    const first = moduleRef.getMastra();
    expect(first).toBeDefined();
    expect(mastraConstructor).toHaveBeenCalledTimes(1);
    expect(createFireSimAgent).toHaveBeenCalledTimes(1);

    const second = moduleRef.getMastra();
    expect(second).toBe(first);
    expect(mastraConstructor).toHaveBeenCalledTimes(1);

    const proxiedOptions = (moduleRef.mastra as unknown as { options?: unknown }).options;
    expect(proxiedOptions).toBeDefined();
    expect(mastraConstructor).toHaveBeenCalledTimes(1);
  });
});
