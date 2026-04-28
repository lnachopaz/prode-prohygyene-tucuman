
-- 1) Profiles: prevenir auto-aprobación
-- Quitamos UPDATE genérico a authenticated y solo permitimos columnas seguras.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, avatar_url) ON public.profiles TO authenticated;

-- 2) Revocar EXECUTE de funciones trigger internas (siguen ejecutándose en triggers)
REVOKE EXECUTE ON FUNCTION public.recalc_predictions_for_match() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated, PUBLIC;

-- 3) Desactivar el código de invitación admin hardcodeado
UPDATE public.admin_invite_codes SET active = false WHERE code = 'PH-ADMIN-2026';
