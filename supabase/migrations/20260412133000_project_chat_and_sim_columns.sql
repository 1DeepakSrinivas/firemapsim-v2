-- Ensure project persistence columns exist for simulation snapshots and chat history.
ALTER TABLE public.map_projects
  ADD COLUMN IF NOT EXISTS last_simulation JSONB,
  ADD COLUMN IF NOT EXISTS agent_chat_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS agent_chat_intro_done BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
