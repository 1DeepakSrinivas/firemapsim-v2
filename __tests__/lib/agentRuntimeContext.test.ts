import { describe, expect, test } from "bun:test";

import {
  buildAgentRuntimeContext,
  createAgentRuntimeContextBodyGetter,
} from "@/lib/agentRuntimeContext";

describe("agent runtime context", () => {
  test("normalizes unknown mode to null", () => {
    const runtime = buildAgentRuntimeContext({
      mode: "unexpected",
      planSnapshot: { any: "value" },
    });

    expect(runtime).toEqual({
      mode: null,
      planSnapshot: { any: "value" },
    });
  });

  test("reads latest mode/plan from mutable refs", () => {
    const modeRef: { current: unknown } = { current: null };
    const planSnapshotRef: { current: { step: string } } = {
      current: { step: "initial" },
    };
    const getBody = createAgentRuntimeContextBodyGetter({
      modeRef,
      planSnapshotRef,
    });

    expect(getBody()).toEqual({
      mode: null,
      planSnapshot: { step: "initial" },
    });

    modeRef.current = "chat";
    planSnapshotRef.current = { step: "guided" };
    expect(getBody()).toEqual({
      mode: "chat",
      planSnapshot: { step: "guided" },
    });

    modeRef.current = "manual";
    planSnapshotRef.current = { step: "manual-edit" };
    expect(getBody()).toEqual({
      mode: "manual",
      planSnapshot: { step: "manual-edit" },
    });
  });
});
