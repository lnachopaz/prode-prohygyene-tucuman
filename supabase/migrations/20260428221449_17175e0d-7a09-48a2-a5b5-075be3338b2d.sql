CREATE OR REPLACE FUNCTION public.list_users_with_email()
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text
  FROM auth.users u;
END;
$$;