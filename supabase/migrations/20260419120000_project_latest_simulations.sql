-- Store compact latest-run summaries and exact replay payloads per project.
CREATE TABLE IF NOT EXISTS public.project_latest_simulations (
  project_id UUID PRIMARY KEY REFERENCES public.map_projects(id) ON DELETE CASCADE,
  summary_json JSONB NOT NULL,
  replay_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_latest_simulations_updated_at
  ON public.project_latest_simulations(updated_at DESC);

ALTER TABLE public.project_latest_simulations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_latest_simulations'
      AND policyname = 'project_latest_simulations_owner_select'
  ) THEN
    CREATE POLICY project_latest_simulations_owner_select
      ON public.project_latest_simulations
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.map_projects p
          WHERE p.id = project_latest_simulations.project_id
            AND p.user_id = auth.uid()::text
        )
      );
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
