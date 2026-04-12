"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import type { UIMessage } from "ai";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SetupUpdate = {
  field: string;
  value: number | string;
};

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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function getRoleLabel(role: string, userName?: string): string {
  if (role === "user") return (userName ?? "USER").toUpperCase();
  if (role === "assistant") return "AGENT";
  return role.toUpperCase();
}

/**
 * Strip ```setup-update ... ``` fences from display text and return
 * the visible text plus any parsed update payloads.
 */
function parseMessageContent(raw: string): {
  displayText: string;
  updates: SetupUpdate[];
} {
  const updates: SetupUpdate[] = [];
  const displayText = raw.replace(
    /```setup-update\n([\s\S]*?)```/g,
    (_, json: string) => {
      try {
        const parsed = JSON.parse(json.trim()) as SetupUpdate;
        if (parsed.field !== undefined && parsed.value !== undefined) {
          updates.push(parsed);
        }
      } catch {
        // malformed block — ignore
      }
      return ""; // remove from display
    },
  ).trim();

  return { displayText, updates };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CedarCaptionChat({
  dimensions,
  className,
  showThinking = true,
  userName,
  messages,
  status,
  sendMessage,
  onSetupUpdate,
}: CedarCaptionChatProps) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const processedIds = useRef<Set<string>>(new Set());
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
      const { updates } = parseMessageContent(getMessageText(msg));
      for (const u of updates) onSetupUpdate(u);
    }
  }, [messages, status, onSetupUpdate]);

  // Kick off the intake sequence on first mount
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current || messages.length > 0) return;
    bootstrapped.current = true;
    void sendMessage({ text: "Hello, I'm ready to set up a simulation. Please guide me." });
  }, [messages.length, sendMessage]);

  async function submitPrompt(prompt: string) {
    const value = prompt.trim();
    if (!value) return;
    await sendMessage({ text: value });
  }

  if (!open) {
    return (
      <div className="pointer-events-auto">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-[#1a1a1a]/95 px-3 py-1.5 text-[11px] font-medium text-white/70 shadow-2xl backdrop-blur transition hover:bg-[#222]/95 hover:text-white sm:gap-2.5 sm:px-4 sm:py-2 sm:text-xs"
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
        </button>
      </div>
    );
  }

  return (
    <section
      className={`pointer-events-auto flex w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1a1a1a]/95 shadow-2xl backdrop-blur sm:rounded-2xl sm:w-[min(560px,calc(100vw-2rem))] md:w-[min(600px,calc(100vw-16rem))] ${className ?? ""}`}
    >
      {/* Title bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2 sm:px-4 sm:py-2.5">
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
          <span className="text-[11px] font-semibold tracking-wide text-white/80 sm:text-xs">
            FireMapSim Agent Chat
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {isBusy && (
            <span className="hidden text-[10px] text-white/35 sm:inline">Streaming</span>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-white/30 transition hover:text-white/70"
          >
            <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="cedar-scroll max-h-40 space-y-1.5 overflow-y-auto p-2.5 sm:max-h-52 sm:space-y-2 sm:p-3">
        {messages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 p-2.5 text-[10px] text-white/30 sm:p-3 sm:text-[11px]">
            Starting simulation setup…
          </p>
        ) : null}

        {messages.map((message) => {
          const raw = getMessageText(message);
          const isUser = message.role === "user";
          const { displayText } = parseMessageContent(raw);
          const roleLabel = getRoleLabel(message.role, userName);
          const isLastAssistant = !isUser && message === messages[messages.length - 1];

          return (
            <div
              key={message.id}
              className={`rounded-lg px-2.5 py-2 text-[11px] sm:px-3 sm:py-2.5 sm:text-xs ${
                isUser
                  ? "border border-blue-500/20 bg-blue-500/10"
                  : "border border-white/5 bg-white/4"
              }`}
            >
              <div className="mb-1 flex items-center justify-between sm:mb-1.5">
                <p className={`text-[9px] font-bold tracking-widest sm:text-[10px] ${isUser ? "text-blue-400" : "text-white/40"}`}>
                  {roleLabel}
                </p>
                {isLastAssistant && isBusy && (
                  <span className="text-[9px] text-white/30 sm:text-[10px]">Streaming ↑</span>
                )}
              </div>
              <p className="whitespace-pre-wrap leading-relaxed text-white/80">
                {displayText || (isBusy && isLastAssistant ? "…" : "")}
              </p>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <form
        className="shrink-0 border-t border-white/10 px-2.5 py-2 sm:px-3 sm:py-2.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const prompt = input;
          setInput("");
          await submitPrompt(prompt);
        }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Reply to the agent…"
            disabled={isBusy}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white placeholder:text-white/30 outline-none transition focus:border-white/20 focus:bg-white/8 disabled:opacity-50 sm:px-3 sm:py-2 sm:text-xs"
          />
          <button
            type="submit"
            disabled={isBusy || !input.trim()}
            className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-2 sm:text-xs"
          >
            Send
          </button>
        </div>
      </form>
    </section>
  );
}
