drop view if exists public.leaderboard;
drop function if exists public.calc_points_match(int,int,int,int,text,text,text);

alter table public.predictions alter column points type numeric(6,2) using points::numeric;
alter table public.predictions alter column points set default 0;

create function public.calc_points_match(
  pa int, pb int, sa int, sb int,
  team_a text, team_b text, stage text
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  base numeric;
  mult numeric := 1;
  s text := lower(coalesce(stage, ''));
  ta text := lower(coalesce(team_a, ''));
  tb text := lower(coalesce(team_b, ''));
  is_final boolean;
  is_semi boolean;
  is_quarter boolean;
  is_ucl boolean;
begin
  if sa is null or sb is null then return 0;
  elsif pa = sa and pb = sb then base := 3;
  elsif sign(pa - pb) = sign(sa - sb) then base := 1;
  else base := 0;
  end if;

  if base = 0 then return 0; end if;

  if ta like '%argentina%' or tb like '%argentina%' then
    mult := mult * 2;
  end if;

  is_ucl := (s like '%champions%');

  if not is_ucl then
    is_final := (s like '%final%')
                and (s not like '%semi%') and (s not like '%tercer%')
                and (s not like '%third%') and (s not like '%1/2%')
                and (s not like '%cuarto%') and (s not like '%quarter%')
                and (s not like '%octavo%');
    is_semi := (not is_final) and (
      s like '%semi%' or s like '%1/2%' or s like '%tercer%' or s like '%third%'
    );
    is_quarter := (not is_final) and (not is_semi) and (
      s like '%cuarto%' or s like '%quarter%'
    );
    if is_final then mult := mult * 2;
    elsif is_semi then mult := mult * 1.5;
    elsif is_quarter then mult := mult * 1.2;
    end if;
  end if;

  return round(base * mult, 2);
end;
$$;

-- Recreate trigger function and admin RPC referencing the new return type
create or replace function public.recalc_predictions_for_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.score_a is distinct from old.score_a)
     or (new.score_b is distinct from old.score_b)
     or (new.status is distinct from old.status) then
    update public.predictions p
      set points = public.calc_points_match(
            p.pred_a, p.pred_b, new.score_a, new.score_b,
            new.team_a, new.team_b, new.stage
          ),
          updated_at = now()
    where p.match_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.recalc_match_points(_match_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_match record;
begin
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'not authorized';
  end if;
  select score_a, score_b, team_a, team_b, stage
    into v_match from public.matches where id = _match_id;
  if not found then raise exception 'match not found'; end if;
  update public.predictions p
    set points = public.calc_points_match(
          p.pred_a, p.pred_b, v_match.score_a, v_match.score_b,
          v_match.team_a, v_match.team_b, v_match.stage
        ),
        updated_at = now()
    where p.match_id = _match_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create view public.leaderboard
with (security_invoker = on) as
  select
    pr.id as user_id,
    pr.display_name,
    pr.avatar_url,
    coalesce(sum(p.points), 0)::numeric as total_points,
    coalesce(sum(case when m.score_a is not null and m.score_b is not null
                       and p.pred_a = m.score_a and p.pred_b = m.score_b then 1 else 0 end), 0)::int as exact_hits,
    coalesce(sum(case when m.score_a is not null and m.score_b is not null
                       and not (p.pred_a = m.score_a and p.pred_b = m.score_b)
                       and sign(p.pred_a - p.pred_b) = sign(m.score_a - m.score_b) then 1 else 0 end), 0)::int as result_hits,
    count(p.id)::int as predictions_count
  from public.profiles pr
  left join public.predictions p on p.user_id = pr.id
  left join public.matches m on m.id = p.match_id and m.status = 'finished'
  group by pr.id, pr.display_name, pr.avatar_url;

update public.predictions p
set points = public.calc_points_match(
      p.pred_a, p.pred_b, m.score_a, m.score_b,
      m.team_a, m.team_b, m.stage
    ),
    updated_at = now()
from public.matches m
where m.id = p.match_id
  and m.score_a is not null
  and m.score_b is not null;