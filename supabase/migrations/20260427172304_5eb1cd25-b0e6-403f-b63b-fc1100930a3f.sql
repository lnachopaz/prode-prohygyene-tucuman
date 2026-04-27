
-- =========================================
-- ENUMS
-- =========================================
create type public.app_role as enum ('admin', 'user');
create type public.match_status as enum ('scheduled', 'live', 'finished');

-- =========================================
-- PROFILES
-- =========================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- =========================================
-- USER ROLES
-- =========================================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

-- =========================================
-- MATCHES
-- =========================================
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  stage text not null default 'Group Stage',
  group_name text,
  team_a text not null,
  team_b text not null,
  team_a_flag text,
  team_b_flag text,
  kickoff_at timestamptz not null,
  status match_status not null default 'scheduled',
  score_a integer,
  score_b integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.matches enable row level security;

-- =========================================
-- PREDICTIONS
-- =========================================
create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  pred_a integer not null check (pred_a >= 0),
  pred_b integer not null check (pred_b >= 0),
  points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);
alter table public.predictions enable row level security;

-- =========================================
-- ADMIN INVITE CODES
-- =========================================
create table public.admin_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.admin_invite_codes enable row level security;

-- Initial code (admin can rotate later)
insert into public.admin_invite_codes (code, active) values ('PH-ADMIN-2026', true);

-- =========================================
-- TIMESTAMP TRIGGER
-- =========================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger matches_touch before update on public.matches
  for each row execute function public.touch_updated_at();
create trigger predictions_touch before update on public.predictions
  for each row execute function public.touch_updated_at();

-- =========================================
-- POINTS CALCULATION
-- =========================================
create or replace function public.calc_points(pa int, pb int, sa int, sb int)
returns int language sql immutable as $$
  select case
    when sa is null or sb is null then 0
    when pa = sa and pb = sb then 3
    when sign(pa - pb) = sign(sa - sb) then 1
    else 0
  end;
$$;

-- Recalculate predictions whenever a match score changes / status hits finished
create or replace function public.recalc_predictions_for_match()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.score_a is distinct from old.score_a)
     or (new.score_b is distinct from old.score_b)
     or (new.status is distinct from old.status) then
    update public.predictions p
      set points = public.calc_points(p.pred_a, p.pred_b, new.score_a, new.score_b),
          updated_at = now()
    where p.match_id = new.id;
  end if;
  return new;
end;
$$;

create trigger matches_recalc after update on public.matches
  for each row execute function public.recalc_predictions_for_match();

-- =========================================
-- HANDLE NEW USER (profile + role)
-- =========================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_display text;
  v_code text;
  v_is_admin boolean := false;
begin
  v_display := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1));
  v_code := new.raw_user_meta_data->>'admin_code';

  insert into public.profiles (id, display_name) values (new.id, v_display);

  if v_code is not null and length(v_code) > 0 then
    select exists(select 1 from public.admin_invite_codes where code = v_code and active) into v_is_admin;
  end if;

  insert into public.user_roles (user_id, role)
  values (new.id, case when v_is_admin then 'admin'::app_role else 'user'::app_role end);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================
-- LEADERBOARD VIEW
-- =========================================
create or replace view public.leaderboard
with (security_invoker = on) as
  select
    pr.id as user_id,
    pr.display_name,
    pr.avatar_url,
    coalesce(sum(p.points), 0)::int as total_points,
    coalesce(sum(case when p.points = 3 then 1 else 0 end), 0)::int as exact_hits,
    coalesce(sum(case when p.points = 1 then 1 else 0 end), 0)::int as result_hits,
    count(p.id)::int as predictions_count
  from public.profiles pr
  left join public.predictions p on p.user_id = pr.id
  left join public.matches m on m.id = p.match_id and m.status = 'finished'
  group by pr.id, pr.display_name, pr.avatar_url;

-- =========================================
-- RLS POLICIES
-- =========================================

-- profiles
create policy "profiles_select_all_authenticated"
  on public.profiles for select to authenticated using (true);
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_admin_update_any"
  on public.profiles for update to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create policy "profiles_admin_delete"
  on public.profiles for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- user_roles
create policy "user_roles_select_own"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "user_roles_admin_all"
  on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- matches: everyone authenticated can read; admins manage
create policy "matches_select_all"
  on public.matches for select to authenticated using (true);
create policy "matches_admin_insert"
  on public.matches for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
create policy "matches_admin_update"
  on public.matches for update to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create policy "matches_admin_delete"
  on public.matches for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- predictions
create policy "predictions_select_own"
  on public.predictions for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "predictions_insert_own_unlocked"
  on public.predictions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id and m.kickoff_at > now() + interval '5 minutes'
    )
  );

create policy "predictions_update_own_unlocked"
  on public.predictions for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id and m.kickoff_at > now() + interval '5 minutes'
    )
  )
  with check (user_id = auth.uid());

create policy "predictions_admin_all"
  on public.predictions for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- admin_invite_codes
create policy "invite_codes_admin_all"
  on public.admin_invite_codes for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
