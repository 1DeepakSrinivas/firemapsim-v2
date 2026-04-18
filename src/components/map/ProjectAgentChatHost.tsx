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
  showStarterPrompt: boolean;
  starterPromptText: string;
  sendStarterPrompt: () => Promise<void>;
  dismissStarterPrompt: () => Promise<void>;
};

type ProjectAgentChatHostProps = {
  projectId: string;
  mode: ProjectWorkflowMode;
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
  planSnapshot,
  initialMessages,
  introDoneServer,
  onPersist,
  onIntroClaimed,
  children,
}: ProjectAgentChatHostProps) {
  const { messages, sendMessage, status } = useChat({
    id: `project-${projectId}`,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/agent",
      body: () => ({
        threadId: `project-${projectId}`,
        mode,
        planSnapshot,
      }),
    }),
  });

  const [introDoneEff, setIntroDoneEff] = useState(introDoneServer);
  useEffect(() => {
    setIntroDoneEff(introDoneServer);
  }, [introDoneServer]);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistKeyRef = useRef<string | null>(null);
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

  const dismissStarterPrompt = useCallback(async () => {
    await consumeIntro();
  }, [consumeIntro]);

  const sendStarterPrompt = useCallback(async () => {
    await sendMessage({ text: DEFAULT_INTRO_USER_MESSAGE });
    await consumeIntro();
  }, [consumeIntro, sendMessage]);

  const showStarterPrompt = !introDoneEff && stableMessages.length === 0;

  return (
    <>
      {children({
        messages: stableMessages,
        sendMessage,
        status,
        showStarterPrompt,
        starterPromptText: DEFAULT_INTRO_USER_MESSAGE,
        sendStarterPrompt,
        dismissStarterPrompt,
      })}
    </>
  );
}
