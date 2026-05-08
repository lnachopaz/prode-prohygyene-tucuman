
CREATE OR REPLACE FUNCTION public.calc_points_match(
  pa integer, pb integer,
  sa integer, sb integer,
  team_a text, team_b text, stage text,
  point_mult numeric DEFAULT 1,
  team_a_mult numeric DEFAULT 1,
  team_b_mult numeric DEFAULT 1
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  base numeric; mult numeric := 1;
  s text := lower(coalesce(stage, ''));
  ta text := lower(coalesce(team_a, ''));
  tb text := lower(coalesce(team_b, ''));
  is_external boolean;
  is_final boolean; is_semi_or_third boolean; is_quarter boolean; is_round_of_16 boolean;
BEGIN
  IF sa IS NULL OR sb IS NULL THEN RETURN 0;
  ELSIF pa = sa AND pb = sb THEN base := 3;
  ELSIF sign(pa - pb) = sign(sa - sb) THEN base := 1;
  ELSE base := 0;
  END IF;
  IF base = 0 THEN RETURN 0; END IF;

  -- Competiciones externas (UCL, etc.) no usan los multiplicadores del Mundial
  is_external := s LIKE '%champions%' OR s LIKE '%uefa%' OR s LIKE '%libertadores%' OR s LIKE '%europa%';

  IF NOT is_external THEN
    IF ta LIKE '%argentina%' OR tb LIKE '%argentina%' THEN mult := mult * 2; END IF;

    is_final := (s LIKE '%final%') AND (s NOT LIKE '%semi%') AND (s NOT LIKE '%tercer%') AND (s NOT LIKE '%third%')
      AND (s NOT LIKE '%1/2%') AND (s NOT LIKE '%cuarto%') AND (s NOT LIKE '%quarter%')
      AND (s NOT LIKE '%octavo%') AND (s NOT LIKE '%dieciseis%')
      AND (s NOT LIKE '%round of 16%') AND (s NOT LIKE '%last 16%')
      AND (s NOT LIKE '%round of 32%') AND (s NOT LIKE '%last 32%');
    is_semi_or_third := (NOT is_final) AND (s LIKE '%semi%' OR s LIKE '%tercer%' OR s LIKE '%third%' OR s LIKE '%1/2%');
    is_quarter := (NOT is_final) AND (NOT is_semi_or_third) AND (s LIKE '%cuarto%' OR s LIKE '%quarter%');
    is_round_of_16 := (NOT is_final) AND (NOT is_semi_or_third) AND (NOT is_quarter)
      AND (s LIKE '%octavo%' OR s LIKE '%round of 16%' OR s LIKE '%last 16%');

    IF is_final THEN mult := mult * 2;
    ELSIF is_semi_or_third THEN mult := mult * 1.5;
    ELSIF is_quarter THEN mult := mult * 1.2;
    ELSIF is_round_of_16 THEN mult := mult * 1.2;
    END IF;
  END IF;

  -- Multiplicadores manuales por partido
  mult := mult * coalesce(point_mult, 1);
  IF coalesce(team_a_mult, 1) <> 1 THEN mult := mult * team_a_mult; END IF;
  IF coalesce(team_b_mult, 1) <> 1 THEN mult := mult * team_b_mult; END IF;

  RETURN round(base * mult, 1);
END;
$$;
