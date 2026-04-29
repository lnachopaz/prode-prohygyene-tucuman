-- Nueva función que calcula puntos considerando equipos y fase del partido
create or replace function public.calc_points_match(
  pa int, pb int, sa int, sb int,
  team_a text, team_b text, stage text
)
returns int
language plpgsql
immutable
set search_path = public
as $$
declare
  base int;
  mult numeric := 1;
  s text := lower(coalesce(stage, ''));
  ta text := lower(coalesce(team_a, ''));
  tb text := lower(coalesce(team_b, ''));
  is_final boolean;
  is_knockout boolean;
begin
  -- Base
  if sa is null or sb is null then
    return 0;
  elsif pa = sa and pb = sb then
    base := 3;
  elsif sign(pa - pb) = sign(sa - sb) then
    base := 1;
  else
    base := 0;
  end if;

  if base = 0 then
    return 0;
  end if;

  -- Multiplicador Argentina
  if ta like '%argentina%' or tb like '%argentina%' then
    mult := mult * 2;
  end if;

  -- Detectar fase
  is_final := (s like '%final%')
              and (s not like '%semi%')
              and (s not like '%tercer%')
              and (s not like '%third%')
              and (s not like '%1/2%')
              and (s not like '%cuarto%')
              and (s not like '%quarter%')
              and (s not like '%octavo%');

  is_knockout := (not is_final) and (
    s like '%octavo%' or s like '%round of 16%' or s like '%last 16%'
    or s like '%cuarto%' or s like '%quarter%'
    or s like '%semi%'
    or s like '%tercer%' or s like '%third%' or s like '%1/2%'
  );

  if is_final then
    mult := mult * 3;
  elsif is_knockout then
    mult := mult * 1.2;
  end if;

  return round(base * mult)::int;
end;
$$;

-- Mantener calc_points(pa,pb,sa,sb) por compatibilidad (sin multiplicadores)
-- pero el trigger ahora usa calc_points_match.

-- Actualizar trigger para usar la nueva función con datos del partido
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

-- Actualizar la función admin de recálculo
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
    into v_match
    from public.matches where id = _match_id;
  if not found then
    raise exception 'match not found';
  end if;

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

-- Recalcular histórico: aplicar la nueva fórmula a todos los pronósticos
-- de partidos finalizados con marcador cargado.
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