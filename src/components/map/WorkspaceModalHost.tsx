"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ActionModal, type ActionId } from "./ActionModal";
import type { ActionPayload, BoundaryGeoJSON, IgnitionPlan } from "@/types/ignitionPlan";
import type { MapInteractionMode } from "./MapInteractionLayer";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkspaceModalHostProps = {
  children: ReactNode;

  // ActionModal
  activeWorkspaceAction: ActionId | null;
  onCloseActionModal: () => void;
  onConfirmAction: (payload: ActionPayload) => void;
  onRequestMapDraw: (mode: MapInteractionMode, action?: "location" | "fuel-break" | "point-ignition" | "line-ignition") => void;
  mapRef: import("leaflet").Map | null;
  onLocationSearchPreview: (preview: { lat: number; lng: number; boundaryGeoJSON: BoundaryGeoJSON } | null) => void;
  currentPlan: IgnitionPlan;

  // Relocate confirm
  pendingRelocate: boolean;
  onRelocateConfirm: () => void;
  onRelocateCancel: () => void;

  // Reset confirm
  pendingReset: boolean;
  onResetConfirm: () => Promise<void>;
  onResetCancel: () => void;
};

// ─── Modal Host ───────────────────────────────────────────────────────────────

export function WorkspaceModalHost({
  children,
  activeWorkspaceAction,
  onCloseActionModal,
  onConfirmAction,
  onRequestMapDraw,
  mapRef,
  onLocationSearchPreview,
  currentPlan,
  pendingRelocate,
  onRelocateConfirm,
  onRelocateCancel,
  pendingReset,
  onResetConfirm,
  onResetCancel,
}: WorkspaceModalHostProps) {
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function handleResetConfirm() {
    if (resetting) return;
    setResetError(null);
    setResetting(true);
    try {
      await onResetConfirm();
      onResetCancel();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Failed to reset project");
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      {children}

      {/* ── ActionModal (location / ignitions / fuel-break) ── */}
      <ActionModal
        actionId={activeWorkspaceAction}
        onClose={() => {
          if (activeWorkspaceAction === "location") {
            onLocationSearchPreview(null);
          }
          onCloseActionModal();
        }}
        onConfirm={(payload) => {
          onConfirmAction(payload);
          onCloseActionModal();
        }}
        onRequestMapDraw={(mode) => {
          const action =
            activeWorkspaceAction === "fuel-break" ? "fuel-break" :
            activeWorkspaceAction === "point-ignition" ? "point-ignition" :
            activeWorkspaceAction === "line-ignition" ? "line-ignition" :
            "location";
          onCloseActionModal();
          if (activeWorkspaceAction === "location") onLocationSearchPreview(null);
          onRequestMapDraw(mode, action);
        }}
        mapRef={mapRef}
        onLocationSearchPreview={onLocationSearchPreview}
        currentPlan={currentPlan}
      />

      {/* ── Relocate confirm dialog ── */}
      <AlertDialog
        open={pendingRelocate}
        onOpenChange={(open) => { if (!open) onRelocateCancel(); }}
      >
        <AlertDialogContent className="z-9999 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Change project location?</AlertDialogTitle>
            <AlertDialogDescription>
              Moving to a new location will reset all scenario data including ignition lines, fuel breaks,
              terrain overlays, and simulation results. Your chat history will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onRelocateCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onRelocateConfirm();
              }}
              className="bg-amber-500 text-white hover:bg-amber-600"
            >
              Change Location
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reset confirm dialog ── */}
      <AlertDialog
        open={pendingReset}
        onOpenChange={(open) => {
          if (!open) {
            setResetError(null);
            onResetCancel();
          }
        }}
      >
        <AlertDialogContent className="z-9999 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset this project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear location, weather, ignitions, fuel breaks, simulation output, and chat history,
              then restore default values. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {resetError && (
            <p className="px-1 text-sm text-destructive">{resetError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setResetError(null); onResetCancel(); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={resetting}
              onClick={() => void handleResetConfirm()}
              className="bg-amber-500 text-white hover:bg-amber-600"
            >
              {resetting ? "Resetting…" : "Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
