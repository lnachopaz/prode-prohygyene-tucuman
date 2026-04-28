-- 1) predictions_locked en matches
alter table public.matches add column if not exists predictions_locked boolean not null default false;

-- 2) Actualizar policies para respetar el bloqueo manual
drop policy if exists predictions_insert_own_unlocked on public.predictions;
create policy predictions_insert_own_unlocked on public.predictions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_approved(auth.uid())
    and exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and m.kickoff_at > (now() + interval '1 hour')
        and m.predictions_locked = false
    )
  );

drop policy if exists predictions_update_own_unlocked on public.predictions;
create policy predictions_update_own_unlocked on public.predictions
  for update to authenticated
  using (
    user_id = auth.uid()
    and is_approved(auth.uid())
    and exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and m.kickoff_at > (now() + interval '1 hour')
        and m.predictions_locked = false
    )
  )
  with check (user_id = auth.uid());

-- 3) sync_logs
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  updated_count integer not null default 0,
  error_message text,
  details jsonb
);

create index if not exists sync_logs_started_at_idx on public.sync_logs (started_at desc);

alter table public.sync_logs enable row level security;

create policy sync_logs_admin_select on public.sync_logs
  for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));

-- 4) Función para recalcular puntos de un partido (solo admin)
create or replace function public.recalc_match_points(_match_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_match record;
begin
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'not authorized';
  end if;

  select score_a, score_b into v_match from public.matches where id = _match_id;
  if not found then
    raise exception 'match not found';
  end if;

  update public.predictions p
    set points = public.calc_points(p.pred_a, p.pred_b, v_match.score_a, v_match.score_b),
        updated_at = now()
    where p.match_id = _match_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 5) Listar pending signups con info de email confirmado (solo admin)
create or replace function public.list_pending_signups()
returns table (
  id uuid,
  display_name text,
  created_at timestamptz,
  email text,
  email_confirmed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'not authorized';
  end if;

  return query
  select p.id, p.display_name, p.created_at, u.email::text, u.email_confirmed_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.status = 'pending'
  order by p.created_at desc;
end;
$$;