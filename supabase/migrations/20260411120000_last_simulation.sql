-- One optional saved simulation result per project (replaced on each successful run).
ALTER TABLE public.map_projects
  ADD COLUMN IF NOT EXISTS last_simulation JSONB;

NOTIFY pgrst, 'reload schema';
