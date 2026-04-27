
-- Set search_path on remaining functions
alter function public.touch_updated_at() set search_path = public;
alter function public.calc_points(int, int, int, int) set search_path = public;

-- Revoke public/anon/authenticated execute on SECURITY DEFINER functions
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.recalc_predictions_for_match() from public, anon, authenticated;
-- has_role is meant to be used inside RLS policies, which run as the table owner
revoke execute on function public.has_role(uuid, app_role) from public, anon;
-- Allow authenticated to call has_role (used in client-side checks too)
grant execute on function public.has_role(uuid, app_role) to authenticated;
