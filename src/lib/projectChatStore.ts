import type { UIMessage } from "ai";

import { supabase } from "@/lib/supabase";

type ChatMessageRow = {
  id: string;
  ui_message_id: string | null;
  ui_message: unknown;
  role: string | null;
  content: string | null;
  created_at: string;
};

function messageToText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

function readMessageCreatedAt(message: UIMessage): string | null {
  for (const part of message.parts) {
    if (
      "createdAt" in part &&
      typeof part.createdAt === "number" &&
      Number.isFinite(part.createdAt)
    ) {
      return new Date(part.createdAt).toISOString();
    }
  }
  return null;
}

function parseStoredMessage(row: ChatMessageRow): UIMessage | null {
  if (row.ui_message && typeof row.ui_message === "object") {
    const asMessage = row.ui_message as UIMessage;
    if (
      typeof asMessage.id === "string" &&
      typeof asMessage.role === "string" &&
      Array.isArray(asMessage.parts)
    ) {
      return asMessage;
    }
  }

  const fallbackId = row.ui_message_id ?? row.id;
  if (!fallbackId || !row.role) return null;
  if (row.role !== "user" && row.role !== "assistant" && row.role !== "system") {
    return null;
  }

  return {
    id: fallbackId,
    role: row.role,
    parts: [{ type: "text", text: row.content ?? "" }],
  };
}

export function dedupeMessagesById(messages: UIMessage[]): UIMessage[] {
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

export async function loadProjectChatMessages(projectId: string): Promise<{
  messages: UIMessage[];
  error?: { message: string; code?: string | null };
}> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, ui_message_id, ui_message, role, content, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return {
      messages: [],
      error: { message: error.message, code: error.code },
    };
  }

  const parsed = (data as ChatMessageRow[])
    .map(parseStoredMessage)
    .filter((msg): msg is UIMessage => Boolean(msg));

  return { messages: dedupeMessagesById(parsed) };
}

function buildNotInValue(ids: string[]): string {
  const quoted = ids.map((id) => `"${id.replaceAll("\"", "\\\"")}"`);
  return `(${quoted.join(",")})`;
}

export async function replaceProjectChatMessages({
  projectId,
  actorClerkUserId,
  messages,
}: {
  projectId: string;
  actorClerkUserId: string;
  messages: UIMessage[];
}): Promise<{ error?: { message: string; code?: string | null } }> {
  const deduped = dedupeMessagesById(messages);

  if (deduped.length === 0) {
    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("project_id", projectId);
    if (error) {
      return { error: { message: error.message, code: error.code } };
    }
    return {};
  }

  const rows = deduped.map((message, index) => ({
    project_id: projectId,
    actor_clerk_user_id: actorClerkUserId,
    ui_message_id: message.id,
    ui_message: message,
    role: message.role,
    content: messageToText(message),
    created_at:
      readMessageCreatedAt(message) ?? new Date(Date.now() + index).toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from("chat_messages")
    .upsert(rows, { onConflict: "project_id,ui_message_id" });

  if (upsertError) {
    return { error: { message: upsertError.message, code: upsertError.code } };
  }

  const keepIds = buildNotInValue(deduped.map((m) => m.id));
  const { error: pruneError } = await supabase
    .from("chat_messages")
    .delete()
    .eq("project_id", projectId)
    .not("ui_message_id", "in", keepIds);

  if (
    pruneError &&
    pruneError.code !== "42703" &&
    pruneError.code !== "PGRST204"
  ) {
    return { error: { message: pruneError.message, code: pruneError.code } };
  }

  return {};
}
