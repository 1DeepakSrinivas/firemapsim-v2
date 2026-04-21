-- Store project chat in normalized rows with full UIMessage payload.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS ui_message_id TEXT,
  ADD COLUMN IF NOT EXISTS ui_message JSONB,
  ADD COLUMN IF NOT EXISTS actor_clerk_user_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_messages_project_id_fkey'
  ) THEN
    ALTER TABLE public.chat_messages
      ADD CONSTRAINT chat_messages_project_id_fkey
      FOREIGN KEY (project_id)
      REFERENCES public.map_projects(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS chat_messages_project_created_idx
  ON public.chat_messages(project_id, created_at);

DROP INDEX IF EXISTS public.chat_messages_project_ui_message_uidx;

CREATE UNIQUE INDEX chat_messages_project_ui_message_uidx
  ON public.chat_messages(project_id, ui_message_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'map_projects'
      AND column_name = 'agent_chat_messages'
  ) THEN
    INSERT INTO public.chat_messages (
      project_id,
      actor_clerk_user_id,
      ui_message_id,
      ui_message,
      role,
      content,
      created_at
    )
    SELECT
      p.id,
      p.user_id,
      m.elem ->> 'id',
      m.elem,
      m.elem ->> 'role',
      COALESCE(
        (
          SELECT string_agg(part ->> 'text', '')
          FROM jsonb_array_elements(COALESCE(m.elem -> 'parts', '[]'::jsonb)) AS part
          WHERE part ->> 'type' = 'text'
        ),
        ''
      ),
      p.updated_at + ((m.ord - 1) * INTERVAL '1 millisecond')
    FROM public.map_projects AS p
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(p.agent_chat_messages) = 'array' THEN p.agent_chat_messages
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS m(elem, ord)
    WHERE
      m.elem ? 'id'
      AND m.elem ? 'role'
      AND (m.elem ->> 'id') IS NOT NULL
    ON CONFLICT (project_id, ui_message_id) DO NOTHING;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
