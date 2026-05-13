
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_in_ranking boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS public.user_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.user_status;
  v_email text;
  v_display text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT status INTO v_status FROM public.profiles WHERE id = auth.uid();
  IF FOUND THEN
    RETURN v_status;
  END IF;

  SELECT email, coalesce(raw_user_meta_data->>'display_name', split_part(email,'@',1))
    INTO v_email, v_display
    FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.profiles (id, display_name, status)
  VALUES (auth.uid(), coalesce(v_display, 'Usuario'), 'pending'::public.user_status)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'user'::public.app_role)
  ON CONFLICT DO NOTHING;

  RETURN 'pending'::public.user_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_blocked(_user_id uuid, _blocked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.profiles SET is_blocked = _blocked, updated_at = now() WHERE id = _user_id;
END;
$$;
