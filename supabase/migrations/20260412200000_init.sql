-- Nuclear reset: drop app tables and all dependent objects, then recreate.
-- Only public.users and public.map_projects are used by this app (Clerk auth; server uses service role).

DROP TABLE IF EXISTS public.map_projects CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- Clerk user mirror. Accessed only from the Next.js server via service role.
CREATE TABLE public.users (
  id         TEXT        PRIMARY KEY,
  email      TEXT        UNIQUE,
  name       TEXT,
  image_url  TEXT,
  url_slug   TEXT        UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fire simulation projects. Many per user.
CREATE TABLE public.map_projects (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  plan       JSONB       NOT NULL,
  weather    JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX map_projects_user_updated_idx
  ON public.map_projects (user_id, updated_at DESC);

NOTIFY pgrst, 'reload schema';
