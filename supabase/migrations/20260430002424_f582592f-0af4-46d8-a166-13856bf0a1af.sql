
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
  is_semi boolean;
  is_quarter boolean;
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

  -- Multiplicador Argentina (siempre acumula)
  if ta like '%argentina%' or tb like '%argentina%' then
    mult := mult * 2;
  end if;

  -- Detectar fase (excluir UCL para multiplicadores de fase: solo Mundial)
  if s not like '%champions%' then
    is_final := (s like '%final%')
                and (s not like '%semi%')
                and (s not like '%tercer%')
                and (s not like '%third%')
                and (s not like '%1/2%')
                and (s not like '%cuarto%')
                and (s not like '%quarter%')
                and (s not like '%octavo%');

    is_semi := (not is_final) and (s like '%semi%' or s like '%1/2%' or s like '%tercer%' or s like '%third%');
    is_quarter := (not is_final) and (not is_semi) and (s like '%cuarto%' or s like '%quarter%');

    if is_final then
      mult := mult * 2;
    elsif is_semi then
      mult := mult * 1.5;
    elsif is_quarter then
      mult := mult * 1.2;
    end if;
    -- Octavos y Dieciseisavos: sin multiplicador de fase
  end if;

  return round(base * mult)::int;
end;
$function$;
