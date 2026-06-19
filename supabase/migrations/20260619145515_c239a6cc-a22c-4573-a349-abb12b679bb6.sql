
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_seed_admin BOOLEAN := (lower(NEW.email) = 'desenvolvimento@escritoriologica.com.br');
  v_must_change BOOLEAN;
BEGIN
  v_must_change := CASE
    WHEN v_is_seed_admin THEN false
    ELSE COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, true)
  END;

  INSERT INTO public.profiles (id, email, display_name, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    v_must_change
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_is_seed_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
