-- Función para eliminar completamente un usuario (solo admin)
CREATE OR REPLACE FUNCTION public.delete_user_completely(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot delete yourself';
  END IF;

  -- Borrar datos de la app
  DELETE FROM public.predictions WHERE user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;

  -- Borrar de auth.users para liberar el email
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;