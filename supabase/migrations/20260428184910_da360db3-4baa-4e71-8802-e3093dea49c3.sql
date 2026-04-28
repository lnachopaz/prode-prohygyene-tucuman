-- 1. Drop policies viejas que dependen de la columna
drop policy if exists predictions_insert_own_unlocked on public.predictions;
drop policy if exists predictions_update_own_unlocked on public.predictions;
drop policy if exists predictions_select_locked_match on public.predictions;

-- 2. Crear enum
create type public.lock_mode as enum ('auto', 'force_open', 'force_closed');

-- 3. Agregar columna nueva y migrar
alter table public.matches add column predictions_lock_mode public.lock_mode not null default 'auto';
update public.matches set predictions_lock_mode = 'force_closed' where predictions_locked = true;

-- 4. Drop columna vieja
alter table public.matches drop column predictions_locked;

-- 5. Recrear policies con nueva lógica
create policy predictions_insert_own_unlocked on public.predictions
for insert to authenticated
with check (
  user_id = auth.uid()
  and is_approved(auth.uid())
  and exists (
    select 1 from public.matches m
    where m.id = predictions.match_id
      and m.predictions_lock_mode <> 'force_closed'
      and (
        m.predictions_lock_mode = 'force_open'
        or (m.predictions_lock_mode = 'auto' and m.kickoff_at > now() + interval '1 hour')
      )
  )
);

create policy predictions_update_own_unlocked on public.predictions
for update to authenticated
using (
  user_id = auth.uid()
  and is_approved(auth.uid())
  and exists (
    select 1 from public.matches m
    where m.id = predictions.match_id
      and m.predictions_lock_mode <> 'force_closed'
      and (
        m.predictions_lock_mode = 'force_open'
        or (m.predictions_lock_mode = 'auto' and m.kickoff_at > now() + interval '1 hour')
      )
  )
)
with check (user_id = auth.uid());

create policy predictions_select_locked_match on public.predictions
for select to authenticated
using (
  is_approved(auth.uid())
  and exists (
    select 1 from public.matches m
    where m.id = predictions.match_id
      and (
        m.status <> 'scheduled'::match_status
        or m.predictions_lock_mode = 'force_closed'
        or (m.predictions_lock_mode = 'auto' and m.kickoff_at <= now() + interval '1 hour')
      )
  )
);