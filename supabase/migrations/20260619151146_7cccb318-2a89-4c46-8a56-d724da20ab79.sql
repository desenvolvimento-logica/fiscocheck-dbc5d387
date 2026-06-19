
-- Comparisons table to persist analysis history with team-level visibility
CREATE TABLE public.comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_role public.app_role NOT NULL DEFAULT 'user',
  cliente text NOT NULL,
  movement text NOT NULL,
  doc_type text NOT NULL,
  diff_count integer NOT NULL DEFAULT 0,
  diff_total numeric NOT NULL DEFAULT 0,
  divergences_count integer NOT NULL DEFAULT 0,
  classified_count integer NOT NULL DEFAULT 0,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  classifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comparisons TO authenticated;
GRANT ALL ON public.comparisons TO service_role;

ALTER TABLE public.comparisons ENABLE ROW LEVEL SECURITY;

-- Trigger to set author_role from the user's highest-priority role
CREATE OR REPLACE FUNCTION public.set_comparison_author_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.user_id := COALESCE(NEW.user_id, auth.uid());
  SELECT role INTO NEW.author_role
  FROM public.user_roles
  WHERE user_id = NEW.user_id
  ORDER BY CASE role
    WHEN 'admin' THEN 1
    WHEN 'coordenador' THEN 2
    WHEN 'lider' THEN 3
    WHEN 'user' THEN 4
    ELSE 5
  END
  LIMIT 1;
  IF NEW.author_role IS NULL THEN
    NEW.author_role := 'user';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER comparisons_set_author_role
BEFORE INSERT ON public.comparisons
FOR EACH ROW EXECUTE FUNCTION public.set_comparison_author_role();

CREATE TRIGGER comparisons_set_updated_at
BEFORE UPDATE ON public.comparisons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
CREATE POLICY "Users insert own comparisons"
ON public.comparisons FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own comparisons"
ON public.comparisons FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own comparisons"
ON public.comparisons FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Role-based read of comparisons"
ON public.comparisons FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR (public.has_role(auth.uid(), 'coordenador') AND author_role IN ('user','lider'))
  OR (public.has_role(auth.uid(), 'lider') AND author_role = 'user')
);

CREATE INDEX comparisons_user_id_idx ON public.comparisons(user_id);
CREATE INDEX comparisons_created_at_idx ON public.comparisons(created_at DESC);
