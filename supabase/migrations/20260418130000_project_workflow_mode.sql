-- Stores per-project setup flow preference in workspace sessions.
ALTER TABLE public.map_projects
  ADD COLUMN IF NOT EXISTS workflow_mode TEXT
  CHECK (workflow_mode IS NULL OR workflow_mode IN ('manual', 'chat'));
