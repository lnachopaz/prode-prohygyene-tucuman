-- 1) Asegurar trigger on_auth_user_created sobre auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2) Backfill: crear profile + role para usuarios de auth.users que no lo tengan
INSERT INTO public.profiles (id, display_name, status)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)),
  'pending'::public.user_status
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'user'::public.app_role
LEFT JOIN public.user_roles ra ON ra.user_id = u.id AND ra.role = 'admin'::public.app_role
WHERE r.user_id IS NULL AND ra.user_id IS NULL;

-- 3) Mover ventana UCL: bloqueada hasta lunes 4 de mayo 2026 a las 15:00 ART (18:00 UTC)
UPDATE public.prediction_windows
SET opens_at = '2026-05-04 18:00:00+00'
WHERE id = 'ucl-sf-2026';