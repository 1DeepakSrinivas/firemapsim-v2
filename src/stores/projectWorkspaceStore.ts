"use client";

import { useSyncExternalStore } from "react";

import {
  defaultIgnitionPlan,
  mergeActionIntoPlan,
  type ActionPayload,
  type IgnitionPlan,
} from "@/types/ignitionPlan";

export type ProjectWorkflowMode = "manual" | "chat" | null;

type WorkspaceState = {
  plan: IgnitionPlan;
  mode: ProjectWorkflowMode;
};

type Listener = () => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

type LoosePartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? U[]
    : T[K] extends object
      ? LoosePartial<T[K]>
      : T[K];
};

export type IgnitionPlanLoosePatch = LoosePartial<IgnitionPlan>;

function mergeLoosePatch<T>(base: T, patch: LoosePartial<T>): T {
  if (!isRecord(base) || !isRecord(patch)) {
    return (patch as T) ?? base;
  }

  const next: Record<string, unknown> = { ...base };

  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) continue;
    const baseValue = next[key];

    if (Array.isArray(patchValue)) {
      next[key] = patchValue;
      continue;
    }

    if (isRecord(baseValue) && isRecord(patchValue)) {
      next[key] = mergeLoosePatch(baseValue, patchValue);
      continue;
    }

    next[key] = patchValue;
  }

  return next as T;
}

export type ProjectWorkspaceStore = {
  getState: () => WorkspaceState;
  subscribe: (listener: Listener) => () => void;
  replacePlan: (
    nextPlan: IgnitionPlan | ((prev: IgnitionPlan) => IgnitionPlan),
  ) => void;
  applyActionPatch: (payload: ActionPayload) => void;
  applyLoosePlanPatch: (patch: IgnitionPlanLoosePatch) => void;
  setMode: (mode: ProjectWorkflowMode) => void;
  reset: (next?: Partial<WorkspaceState>) => void;
};

export function createProjectWorkspaceStore(
  initialState?: Partial<WorkspaceState>,
): ProjectWorkspaceStore {
  let state: WorkspaceState = {
    plan: initialState?.plan ?? defaultIgnitionPlan(),
    mode: initialState?.mode ?? null,
  };
  const listeners = new Set<Listener>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    replacePlan: (nextPlan) => {
      const plan =
        typeof nextPlan === "function"
          ? nextPlan(state.plan)
          : nextPlan;
      state = { ...state, plan };
      emit();
    },
    applyActionPatch: (payload) => {
      state = {
        ...state,
        plan: mergeActionIntoPlan(state.plan, payload),
      };
      emit();
    },
    applyLoosePlanPatch: (patch) => {
      state = {
        ...state,
        plan: mergeLoosePatch(state.plan, patch),
      };
      emit();
    },
    setMode: (mode) => {
      if (state.mode === mode) return;
      state = { ...state, mode };
      emit();
    },
    reset: (next) => {
      state = {
        plan: next?.plan ?? defaultIgnitionPlan(),
        mode: next?.mode ?? null,
      };
      emit();
    },
  };
}

export function useProjectWorkspaceStore<T>(
  store: ProjectWorkspaceStore,
  selector: (state: WorkspaceState) => T,
): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
