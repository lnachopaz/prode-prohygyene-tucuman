-- 1) Nueva columna: multiplicador específico por equipo
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS team_multiplier_override jsonb;

COMMENT ON COLUMN public.matches.team_multiplier_override IS 'Multiplicador especial atado a un equipo del partido. Forma: {"team":"FC Bayern München","mult":2}. Se aplica solo si el equipo coincide con team_a o team_b del propio partido.';

-- 2) Recrear calc_points_match con soporte de team_multiplier_override
CREATE OR REPLACE FUNCTION public.calc_points_match(
  pa integer, pb integer, sa integer, sb integer,
  team_a text, team_b text, stage text,
  team_mult jsonb DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
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
  tm_team text;
  tm_mult numeric;
begin
  if sa is null or sb is null then return 0;
  elsif pa = sa and pb = sb then base := 3;
  elsif sign(pa - pb) = sign(sa - sb) then base := 1;
  else base := 0;
  end if;

  if base = 0 then return 0; end if;

  -- Multiplicador por equipo (Argentina por defecto en Mundial)
  if ta like '%argentina%' or tb like '%argentina%' then
    mult := mult * 2;
  end if;

  -- Multiplicador especial por equipo (configurable por partido)
  if team_mult is not null then
    tm_team := lower(coalesce(team_mult->>'team', ''));
    tm_mult := nullif(team_mult->>'mult', '')::numeric;
    if tm_team <> '' and tm_mult is not null and tm_mult > 0
       and (ta = tm_team or tb = tm_team or ta like '%' || tm_team || '%' or tb like '%' || tm_team || '%') then
      mult := mult * tm_mult;
    end if;
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
$function$;

-- 3) calc_points_full ahora también recibe team_mult
CREATE OR REPLACE FUNCTION public.calc_points_full(
  pa integer, pb integer, sa integer, sb integer,
  team_a text, team_b text, stage text,
  override numeric,
  team_mult jsonb DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
declare
  base_points numeric;
begin
  base_points := public.calc_points_match(pa, pb, sa, sb, team_a, team_b, stage, team_mult);
  if base_points = 0 then return 0; end if;
  if override is not null and override > 0 then
    return round(base_points * override, 2);
  end if;
  return base_points;
end;
$function$;

-- 4) Trigger recalc: pasar team_multiplier_override y recalc también si cambia
CREATE OR REPLACE FUNCTION public.recalc_predictions_for_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if (new.score_a is distinct from old.score_a)
     or (new.score_b is distinct from old.score_b)
     or (new.status is distinct from old.status)
     or (new.multiplier_override is distinct from old.multiplier_override)
     or (new.team_multiplier_override is distinct from old.team_multiplier_override) then
    update public.predictions p
      set points = public.calc_points_full(
            p.pred_a, p.pred_b, new.score_a, new.score_b,
            new.team_a, new.team_b, new.stage,
            new.multiplier_override, new.team_multiplier_override
          ),
          updated_at = now()
    where p.match_id = new.id;
  end if;
  return new;
end;
$function$;

-- 5) recalc_match_points actualizado
CREATE OR REPLACE FUNCTION public.recalc_match_points(_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_count int;
  v_match record;
begin
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'not authorized';
  end if;
  select score_a, score_b, team_a, team_b, stage, multiplier_override, team_multiplier_override
    into v_match from public.matches where id = _match_id;
  if not found then raise exception 'match not found'; end if;
  update public.predictions p
    set points = public.calc_points_full(
          p.pred_a, p.pred_b, v_match.score_a, v_match.score_b,
          v_match.team_a, v_match.team_b, v_match.stage,
          v_match.multiplier_override, v_match.team_multiplier_override
        ),
        updated_at = now()
    where p.match_id = _match_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- 6) Asegurar trigger en matches
DROP TRIGGER IF EXISTS trg_recalc_predictions_for_match ON public.matches;
CREATE TRIGGER trg_recalc_predictions_for_match
AFTER UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.recalc_predictions_for_match();

-- 7) RPC para borrar pronóstico de cualquier user (admin)
CREATE OR REPLACE FUNCTION public.admin_delete_prediction(_prediction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'not authorized';
  end if;
  delete from public.predictions where id = _prediction_id;
end;
$function$;