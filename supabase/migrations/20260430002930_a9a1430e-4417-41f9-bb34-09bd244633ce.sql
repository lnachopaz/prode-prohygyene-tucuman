CREATE OR REPLACE FUNCTION public.calc_points_match(pa integer, pb integer, sa integer, sb integer, team_a text, team_b text, stage text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  base int;
  mult numeric := 1;
  s text := lower(coalesce(stage, ''));
  ta text := lower(coalesce(team_a, ''));
  tb text := lower(coalesce(team_b, ''));
  is_final boolean;
  is_semi_or_third boolean;
  is_quarter boolean;
  is_round_of_16 boolean;
begin
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

  -- Argentina x2
  if ta like '%argentina%' or tb like '%argentina%' then
    mult := mult * 2;
  end if;

  -- Final del Mundial (excluye semis, tercer puesto, cuartos, octavos, dieciseisavos)
  is_final := (s like '%final%')
              and (s not like '%semi%')
              and (s not like '%tercer%')
              and (s not like '%third%')
              and (s not like '%1/2%')
              and (s not like '%cuarto%')
              and (s not like '%quarter%')
              and (s not like '%octavo%')
              and (s not like '%dieciseis%')
              and (s not like '%round of 16%')
              and (s not like '%last 16%')
              and (s not like '%round of 32%')
              and (s not like '%last 32%');

  -- Semis o 3° puesto x1.5
  is_semi_or_third := (not is_final) and (
    s like '%semi%'
    or s like '%tercer%' or s like '%third%' or s like '%1/2%'
  );

  -- Cuartos x1.2
  is_quarter := (not is_final) and (not is_semi_or_third) and (
    s like '%cuarto%' or s like '%quarter%'
  );

  -- Octavos x1.2
  is_round_of_16 := (not is_final) and (not is_semi_or_third) and (not is_quarter) and (
    s like '%octavo%'
    or s like '%round of 16%' or s like '%last 16%'
  );

  if is_final then
    mult := mult * 2;
  elsif is_semi_or_third then
    mult := mult * 1.5;
  elsif is_quarter then
    mult := mult * 1.2;
  elsif is_round_of_16 then
    mult := mult * 1.2;
  end if;
  -- Dieciseisavos (round of 32) y fase de grupos: x1 (sin multiplicador extra de etapa)

  return round(base * mult)::int;
end;
$function$;

-- Recalcular puntos históricos con las nuevas reglas
UPDATE public.predictions p
SET points = public.calc_points_match(
      p.pred_a, p.pred_b, m.score_a, m.score_b,
      m.team_a, m.team_b, m.stage
    ),
    updated_at = now()
FROM public.matches m
WHERE p.match_id = m.id
  AND m.status = 'finished';