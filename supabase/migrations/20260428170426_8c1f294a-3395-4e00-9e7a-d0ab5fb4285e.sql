DROP POLICY IF EXISTS profiles_admin_update_any ON public.profiles;
CREATE POLICY profiles_admin_update_any ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));