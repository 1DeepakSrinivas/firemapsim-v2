import type { ProjectWorkflowMode } from "@/stores/projectWorkspaceStore";

export type AgentRuntimeContext<TPlanSnapshot = unknown> = {
  mode: ProjectWorkflowMode;
  planSnapshot: TPlanSnapshot;
};

type MutableRef<T> = {
  current: T;
};

export function normalizeProjectWorkflowMode(value: unknown): ProjectWorkflowMode {
  if (value === "manual" || value === "chat") {
    return value;
  }
  return null;
}

export function buildAgentRuntimeContext<TPlanSnapshot>(input: {
  mode: unknown;
  planSnapshot: TPlanSnapshot;
}): AgentRuntimeContext<TPlanSnapshot> {
  return {
    mode: normalizeProjectWorkflowMode(input.mode),
    planSnapshot: input.planSnapshot,
  };
}

export function createAgentRuntimeContextBodyGetter<TPlanSnapshot>(input: {
  modeRef: MutableRef<unknown>;
  planSnapshotRef: MutableRef<TPlanSnapshot>;
}): () => AgentRuntimeContext<TPlanSnapshot> {
  return () =>
    buildAgentRuntimeContext({
      mode: input.modeRef.current,
      planSnapshot: input.planSnapshotRef.current,
    });
}
