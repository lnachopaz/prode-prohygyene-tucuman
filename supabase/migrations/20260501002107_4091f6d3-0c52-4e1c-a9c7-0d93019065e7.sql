revoke execute on function public.ensure_user_profile() from anon;
grant execute on function public.ensure_user_profile() to authenticated;

revoke execute on function public.list_pending_signups() from anon;
grant execute on function public.list_pending_signups() to authenticated;

revoke execute on function public.set_user_status(uuid, public.user_status) from anon;
grant execute on function public.set_user_status(uuid, public.user_status) to authenticated;

revoke execute on function public.list_users_with_email() from anon;
grant execute on function public.list_users_with_email() to authenticated;

revoke execute on function public.delete_user_completely(uuid) from anon;
grant execute on function public.delete_user_completely(uuid) to authenticated;

revoke execute on function public.recalc_match_points(uuid) from anon;
grant execute on function public.recalc_match_points(uuid) to authenticated;