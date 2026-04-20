-- Roll back Mastra-managed relational storage and latest simulation table.
-- Project latest simulation now persists to map_projects.last_simulation only.

DROP TABLE IF EXISTS public.project_latest_simulations CASCADE;

DO $$
DECLARE
  table_record RECORD;
BEGIN
  FOR table_record IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'mastra\_%' ESCAPE '\'
  LOOP
    EXECUTE format(
      'DROP TABLE IF EXISTS %I.%I CASCADE',
      table_record.schemaname,
      table_record.tablename
    );
  END LOOP;
END
$$;
