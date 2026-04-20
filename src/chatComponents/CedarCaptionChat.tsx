"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Send } from "lucide-react";
import type { UIMessage } from "ai";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { IgnitionPlanLoosePatch } from "@/stores/projectWorkspaceStore";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Parsed from fenced setup-update blocks; field may be weather keys or cellResolution / cellSpaceDimension / cellSpaceDimensionLat. */
export type SetupUpdate = {
  field: string;
  value: number | string;
};

export type RunTrigger = {
  action: "run-simulation";
  simulationTimesteps?: number;
  /** Legacy field name; interpreted as hours in trigger handling. */
  simulationHours?: number;
};

export type PlaybackControlTrigger = {
  action: "playback-control";
  playbackAction: "play" | "pause";
};

export type ResetProjectTrigger = {
  action: "reset-project";
};

export type AgentCommandTrigger =
  | RunTrigger
  | PlaybackControlTrigger
  | ResetProjectTrigger;

type CedarCaptionChatProps = {
  dimensions?: { width?: number; maxWidth?: number };
  className?: string;
  showThinking?: boolean;
  userName?: string;
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  sendMessage: (
    message?:
      | { text: string; messageId?: string }
      | { parts: Array<{ type: "text"; text: string }>; messageId?: string },
  ) => Promise<void>;
  onSetupUpdate?: (update: SetupUpdate) => void;
  onUpdatePlanPatch?: (patch: IgnitionPlanLoosePatch) => void;
  onRunTrigger?: (trigger: RunTrigger) => void;
  onAgentCommand?: (command: AgentCommandTrigger) => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/**
 * Strip ```setup-update ... ``` fences from display text and return
 * the visible text plus any parsed update payloads.
 */
function parseMessageContent(raw: string): {
  displayText: string;
  updates: SetupUpdate[];
  runTriggers: RunTrigger[];
} {
  const updates: SetupUpdate[] = [];
  const runTriggers: RunTrigger[] = [];

  const withoutSetup = raw.replace(/```setup-update\n([\s\S]*?)```/g, (_, json: string) => {
    try {
      const parsed = JSON.parse(json.trim()) as SetupUpdate;
      if (parsed.field !== undefined && parsed.value !== undefined) {
        updates.push(parsed);
      }
    } catch {
      // malformed block — ignore
    }
    return "";
  });

  const displayText = withoutSetup
    .replace(/```run-trigger\n([\s\S]*?)```/g, (_, json: string) => {
      try {
        const parsed = JSON.parse(json.trim()) as RunTrigger;
        if (parsed.action === "run-simulation") {
          runTriggers.push(parsed);
        }
      } catch {
        // malformed block — ignore
      }
      return "";
    })
    .trim();

  return { displayText, updates, runTriggers };
}

function extractUpdatePlanPatches(message: UIMessage): Array<{
  key: string;
  patch: IgnitionPlanLoosePatch;
}> {
  const patches: Array<{ key: string; patch: IgnitionPlanLoosePatch }> = [];

  for (const part of message.parts as Array<Record<string, unknown>>) {
    if (!part || typeof part.type !== "string") continue;

    const isNamedTool =
      part.type.startsWith("tool-") && part.type === "tool-update-plan";
    const isDynamicTool =
      part.type === "dynamic-tool" && part.toolName === "update-plan";

    if (!isNamedTool && !isDynamicTool) continue;
    if (part.state !== "output-available") continue;

    const toolCallId =
      typeof part.toolCallId === "string" ? part.toolCallId : message.id;
    const output = part.output;
    if (!output || typeof output !== "object") continue;

    const candidate = (output as { patch?: unknown }).patch ?? output;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    patches.push({
      key: `${message.id}:${toolCallId}`,
      patch: candidate as IgnitionPlanLoosePatch,
    });
  }

  return patches;
}

function partMatchesTool(
  part: Record<string, unknown>,
  toolName: string,
): boolean {
  if (typeof part.type !== "string") return false;
  const isNamedTool = part.type === `tool-${toolName}`;
  const isDynamicTool =
    part.type === "dynamic-tool" && part.toolName === toolName;
  return isNamedTool || isDynamicTool;
}

function extractAgentCommandTriggers(message: UIMessage): Array<{
  key: string;
  command: AgentCommandTrigger;
}> {
  const commands: Array<{ key: string; command: AgentCommandTrigger }> = [];

  for (const part of message.parts as Array<Record<string, unknown>>) {
    if (!part || part.state !== "output-available") continue;

    const toolCallId =
      typeof part.toolCallId === "string" ? part.toolCallId : message.id;
    const output = part.output;
    if (!output || typeof output !== "object" || Array.isArray(output)) continue;
    const payload = output as Record<string, unknown>;

    if (partMatchesTool(part, "run-simulation")) {
      const rawTimesteps = payload.simulationTimesteps;
      const simulationTimesteps =
        typeof rawTimesteps === "number" && Number.isFinite(rawTimesteps)
          ? rawTimesteps
          : undefined;
      commands.push({
        key: `${message.id}:${toolCallId}:run`,
        command: {
          action: "run-simulation",
          ...(simulationTimesteps !== undefined ? { simulationTimesteps } : {}),
        },
      });
      continue;
    }

    if (partMatchesTool(part, "playback-control")) {
      const playbackAction = payload.playbackAction;
      if (playbackAction !== "play" && playbackAction !== "pause") continue;
      commands.push({
        key: `${message.id}:${toolCallId}:playback`,
        command: {
          action: "playback-control",
          playbackAction,
        },
      });
      continue;
    }

    if (partMatchesTool(part, "reset-project")) {
      commands.push({
        key: `${message.id}:${toolCallId}:reset`,
        command: { action: "reset-project" },
      });
    }
  }

  return commands;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CedarCaptionChat({
  dimensions,
  className,
  showThinking = true,
  userName: _userName,
  messages,
  status,
  sendMessage,
  onSetupUpdate,
  onUpdatePlanPatch,
  onRunTrigger,
  onAgentCommand,
}: CedarCaptionChatProps) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const processedIds = useRef<Set<string>>(new Set());
  const processedToolPatches = useRef<Set<string>>(new Set());
  const processedToolCommands = useRef<Set<string>>(new Set());
  const isBusy = status === "submitted" || status === "streaming";

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Parse setup-update blocks from new assistant messages and fire callback
  useEffect(() => {
    if (!onSetupUpdate) return;
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      if (processedIds.current.has(msg.id)) continue;
      // Only process complete messages (not mid-stream)
      if (status === "streaming" && msg === messages[messages.length - 1]) continue;
      processedIds.current.add(msg.id);
      const { updates, runTriggers } = parseMessageContent(getMessageText(msg));
      for (const u of updates) onSetupUpdate(u);
      if (onRunTrigger) {
        for (const trigger of runTriggers) onRunTrigger(trigger);
      }
    }
  }, [messages, status, onSetupUpdate, onRunTrigger]);

  useEffect(() => {
    if (!onUpdatePlanPatch) return;

    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const patches = extractUpdatePlanPatches(msg);
      for (const { key, patch } of patches) {
        if (processedToolPatches.current.has(key)) continue;
        processedToolPatches.current.add(key);
        onUpdatePlanPatch(patch);
      }
    }
  }, [messages, onUpdatePlanPatch]);

  useEffect(() => {
    if (!onAgentCommand) return;

    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const commands = extractAgentCommandTriggers(msg);
      for (const { key, command } of commands) {
        if (processedToolCommands.current.has(key)) continue;
        processedToolCommands.current.add(key);
        onAgentCommand(command);
      }
    }
  }, [messages, onAgentCommand]);

  async function submitPrompt(prompt: string) {
    const value = prompt.trim();
    if (!value) return;
    await sendMessage({ text: value });
  }

  if (!open) {
    return (
      <div className="pointer-events-auto">
        <motion.button
          type="button"
          onClick={() => setOpen(true)}
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="themed-layer flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-2xl backdrop-blur transition hover:bg-muted hover:text-foreground sm:gap-2.5 sm:px-4 sm:py-2 sm:text-xs"
        >
          <span
            className={
              status === "error"
                ? "cedar-status-dot cedar-status-dot--error"
                : isBusy
                  ? "cedar-status-dot cedar-status-dot--running"
                  : "cedar-status-dot cedar-status-dot--idle"
            }
          />
          FireMapSim Agent Chat
        </motion.button>
      </div>
    );
  }

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.section
        key="chat-open"
        initial={{ opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.985 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={`themed-layer pointer-events-auto flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-2xl backdrop-blur sm:rounded-2xl sm:w-[min(560px,calc(100vw-2rem))] md:w-[min(600px,calc(100vw-16rem))] ${className ?? ""}`}
      >
      {/* Title bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 sm:px-4 sm:py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={
              status === "error"
                ? "cedar-status-dot cedar-status-dot--error"
                : isBusy
                  ? "cedar-status-dot cedar-status-dot--running"
                  : "cedar-status-dot cedar-status-dot--idle"
            }
          />
          <span className="text-[11px] font-semibold tracking-wide text-foreground sm:text-xs">
            FireMapSim Agent Chat
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {isBusy && (
            <span className="hidden text-[10px] text-muted-foreground sm:inline">Streaming</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages — iMessage-style bubbles */}
      <div
        ref={scrollRef}
        className="cedar-scroll max-h-40 space-y-1 overflow-y-auto bg-muted/40 p-2.5 sm:max-h-52 sm:space-y-1.5 sm:p-3"
      >
        {messages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-2.5 text-[10px] text-muted-foreground sm:p-3 sm:text-[11px]">
            Starting simulation setup…
          </p>
        ) : null}

        {messages.map((message) => {
          const raw = getMessageText(message);
          const isUser = message.role === "user";
          const { displayText } = parseMessageContent(raw);
          const isLastAssistant = !isUser && message === messages[messages.length - 1];

          return (
            <div
              key={message.id}
              className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[min(100%,14rem)] px-2.5 py-1.5 text-left text-[11px] leading-snug shadow-sm sm:max-w-[min(72%,18rem)] sm:px-3 sm:py-2 sm:text-[12px] ${
                  isUser
                    ? "rounded-[0.95rem] rounded-br-sm bg-[#0A84FF] text-white text-pretty"
                    : "rounded-[0.95rem] rounded-bl-sm bg-muted text-foreground text-pretty"
                }`}
              >
                <p className="whitespace-pre-wrap">
                  {displayText || (isBusy && isLastAssistant ? "…" : "")}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <form
        className="shrink-0 border-t border-border px-2.5 py-2 sm:px-3 sm:py-2.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const prompt = input;
          setInput("");
          await submitPrompt(prompt);
        }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Reply to the agent…"
            disabled={isBusy}
            className="h-auto flex-1 rounded-lg border-border bg-background px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus-visible:ring-ring sm:px-3 sm:py-2 sm:text-xs"
          />
          <Button
            disabled={isBusy || !input.trim()}
            className="h-auto shrink-0 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-blue-500 sm:px-3 sm:py-2 sm:text-xs"
          >
            Send
          </Button>
        </div>
      </form>
      </motion.section>
    </AnimatePresence>
  );
}
