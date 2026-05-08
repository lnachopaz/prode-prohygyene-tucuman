create unique index if not exists user_roles_user_id_role_unique
on public.user_roles (user_id, role);

create or replace function public.ensure_user_profile()
returns public.user_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_display text;
  v_status public.user_status;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select u.email::text,
         coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), split_part(u.email::text, '@', 1), 'Usuario')
    into v_email, v_display
  from auth.users u
  where u.id = v_user_id;

  if v_email is null then
    raise exception 'user not found';
  end if;

  insert into public.profiles (id, display_name, status)
  values (v_user_id, v_display, 'pending'::public.user_status)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (v_user_id, 'user'::public.app_role)
  on conflict (user_id, role) do nothing;

  select status into v_status
  from public.profiles
  where id = v_user_id;

  return coalesce(v_status, 'pending'::public.user_status);
end;
$$;

create or replace function public.list_pending_signups()
returns table(id uuid, display_name text, created_at timestamp with time zone, email text, email_confirmed_at timestamp with time zone)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'not authorized';
  end if;

  return query
  select u.id,
         coalesce(p.display_name, nullif(u.raw_user_meta_data->>'display_name', ''), split_part(u.email::text, '@', 1), 'Usuario')::text as display_name,
         coalesce(p.created_at, u.created_at) as created_at,
         u.email::text,
         u.email_confirmed_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where coalesce(p.status, 'pending'::public.user_status) = 'pending'::public.user_status
    and not exists (
      select 1 from public.user_roles ur
      where ur.user_id = u.id and ur.role = 'admin'::public.app_role
    )
  order by coalesce(p.created_at, u.created_at) desc;
end;
$$;

create or replace function public.set_user_status(_user_id uuid, _status public.user_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_display text;
begin
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'not authorized';
  end if;

  select u.email::text,
         coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), split_part(u.email::text, '@', 1), 'Usuario')
    into v_email, v_display
  from auth.users u
  where u.id = _user_id;

  if v_email is null then
    raise exception 'user not found';
  end if;

  insert into public.profiles (id, display_name, status)
  values (_user_id, v_display, _status)
  on conflict (id) do update
    set status = excluded.status,
        updated_at = now();

  insert into public.user_roles (user_id, role)
  values (_user_id, 'user'::public.app_role)
  on conflict (user_id, role) do nothing;
end;
$$;

create or replace function public.list_users_with_email()
returns table(id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'not authorized';
  end if;

  return query
  select u.id, u.email::text
  from auth.users u
  order by u.email;
end;
$$;