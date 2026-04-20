"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { IgnitionPlan } from "@/types/ignitionPlan";
import type { ProjectWorkflowMode } from "@/stores/projectWorkspaceStore";
import { createAgentRuntimeContextBodyGetter } from "@/lib/agentRuntimeContext";

const DEFAULT_INTRO_USER_MESSAGE =
  "Hello, I'm ready to set up a simulation. Please guide me.";

function dedupeMessagesById(messages: UIMessage[]): UIMessage[] {
  const seen = new Set<string>();
  const out: UIMessage[] = [];

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg || seen.has(msg.id)) continue;
    seen.add(msg.id);
    out.unshift(msg);
  }

  return out;
}

type ChatHelpers = {
  messages: UIMessage[];
  sendMessage: ReturnType<typeof useChat>["sendMessage"];
  status: ReturnType<typeof useChat>["status"];
};

type ProjectAgentChatHostProps = {
  projectId: string;
  mode: ProjectWorkflowMode;
  autoStartGuidedNonce: number;
  planSnapshot: IgnitionPlan;
  initialMessages: UIMessage[];
  introDoneServer: boolean;
  onPersist: (messages: UIMessage[], introDone: boolean) => void;
  onIntroClaimed: () => void;
  children: (helpers: ChatHelpers) => ReactNode;
};

export function ProjectAgentChatHost({
  projectId,
  mode,
  autoStartGuidedNonce,
  planSnapshot,
  initialMessages,
  introDoneServer,
  onPersist,
  onIntroClaimed,
  children,
}: ProjectAgentChatHostProps) {
  const modeRef = useRef<ProjectWorkflowMode>(mode);
  const planSnapshotRef = useRef(planSnapshot);
  modeRef.current = mode;
  planSnapshotRef.current = planSnapshot;

  const transportBody = useMemo(
    () =>
      createAgentRuntimeContextBodyGetter({
        modeRef,
        planSnapshotRef,
      }),
    [],
  );

  const { messages, sendMessage, status } = useChat({
    id: `project-${projectId}`,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/agent",
      body: () => {
        const runtime = transportBody();
        return {
          threadId: `project-${projectId}`,
          mode: runtime.mode,
          planSnapshot: runtime.planSnapshot,
        };
      },
    }),
  });

  const [introDoneEff, setIntroDoneEff] = useState(introDoneServer);
  useEffect(() => {
    setIntroDoneEff(introDoneServer);
  }, [introDoneServer]);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistKeyRef = useRef<string | null>(null);
  const handledAutoStartNonceRef = useRef(0);
  const stableMessages = useMemo(() => dedupeMessagesById(messages), [messages]);

  const schedulePersist = useCallback(
    (msgs: UIMessage[], introDone: boolean) => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        onPersist(msgs, introDone);
      }, 800);
    },
    [onPersist],
  );

  useEffect(() => {
    const persistKey = `${introDoneEff}::${JSON.stringify(stableMessages)}`;
    if (lastPersistKeyRef.current === persistKey) {
      return;
    }
    lastPersistKeyRef.current = persistKey;
    schedulePersist(stableMessages, introDoneEff);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [stableMessages, introDoneEff, schedulePersist]);

  const consumeIntro = useCallback(async () => {
    const res = await fetch(`/api/project/${projectId}/chat-intro`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error("Failed to update starter prompt state");
    }
    const json = (await res.json()) as { claimed?: boolean };
    if (json.claimed) {
      setIntroDoneEff(true);
      onIntroClaimed();
      return;
    }
    setIntroDoneEff(true);
    onIntroClaimed();
  }, [projectId, onIntroClaimed]);

  const sendGuidedStartMessage = useCallback(async () => {
    await sendMessage({ text: DEFAULT_INTRO_USER_MESSAGE });
    await consumeIntro();
  }, [consumeIntro, sendMessage]);

  useEffect(() => {
    if (autoStartGuidedNonce <= handledAutoStartNonceRef.current) return;
    if (mode !== "chat") return;
    if (stableMessages.length > 0) {
      handledAutoStartNonceRef.current = autoStartGuidedNonce;
      return;
    }
    handledAutoStartNonceRef.current = autoStartGuidedNonce;
    void sendGuidedStartMessage();
  }, [autoStartGuidedNonce, mode, stableMessages.length, sendGuidedStartMessage]);

  return (
    <>
      {children({
        messages: stableMessages,
        sendMessage,
        status,
      })}
    </>
  );
}
