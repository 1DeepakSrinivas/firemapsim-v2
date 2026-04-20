"use client";

import { MessageSquareText, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type WorkflowModeBannerProps = {
  onGuideMeViaChat: () => void;
  onManualMode: () => void;
  onDismiss: () => void;
};

export function WorkflowModeBanner({
  onGuideMeViaChat,
  onManualMode,
  onDismiss,
}: WorkflowModeBannerProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[1200] flex justify-center px-3 sm:top-4">
      <div className="pointer-events-auto w-full max-w-2xl rounded-xl border border-border bg-card/95 p-3 text-foreground shadow-lg ring-1 ring-primary/15 backdrop-blur sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Choose Your Setup Flow
            </p>
            <p className="text-sm text-muted-foreground">
              You can configure this project via chat guidance or manually in the sidebar.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            className="h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            title="Dismiss (defaults to manual)"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            onClick={onGuideMeViaChat}
            className="h-9 flex-1 justify-center gap-2"
          >
            <MessageSquareText className="h-4 w-4" />
            Guide me via chat
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onManualMode}
            className="h-9 flex-1 justify-center gap-2"
          >
            <SlidersHorizontal className="h-4 w-4" />
            I&apos;ll do it manually
          </Button>
        </div>
      </div>
    </div>
  );
}
