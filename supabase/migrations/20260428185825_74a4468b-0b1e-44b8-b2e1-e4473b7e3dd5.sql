create or replace function public.set_user_status(_user_id uuid, _status public.user_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'not authorized';
  end if;
  update public.profiles set status = _status, updated_at = now() where id = _user_id;
end;
$$;

grant execute on function public.set_user_status(uuid, public.user_status) to authenticated;