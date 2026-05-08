
-- 1) Bloqueo de cuentas
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- 2) Multiplicadores manuales por partido
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS point_multiplier numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS team_a_multiplier numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS team_b_multiplier numeric NOT NULL DEFAULT 1;

-- 3) is_approved: tener en cuenta is_blocked
CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND status = 'approved'
      AND is_blocked = false
  ) OR (
    public.has_role(_user_id, 'admin')
    AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_blocked = true)
  );
$$;

-- 4) calc_points_match: aceptar multiplicadores manuales
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
  is_final boolean; is_semi_or_third boolean; is_quarter boolean; is_round_of_16 boolean;
BEGIN
  IF sa IS NULL OR sb IS NULL THEN RETURN 0;
  ELSIF pa = sa AND pb = sb THEN base := 3;
  ELSIF sign(pa - pb) = sign(sa - sb) THEN base := 1;
  ELSE base := 0;
  END IF;
  IF base = 0 THEN RETURN 0; END IF;

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

  -- Multiplicadores manuales por partido
  mult := mult * coalesce(point_mult, 1);
  -- Multiplicador específico de equipo (aplica si participa)
  IF ta LIKE '%bayern%' OR tb LIKE '%bayern%' THEN
    -- compatibilidad: el "team_x_multiplier" se aplica si ese equipo participa
    NULL;
  END IF;
  IF coalesce(team_a_mult, 1) <> 1 THEN mult := mult * team_a_mult; END IF;
  IF coalesce(team_b_mult, 1) <> 1 THEN mult := mult * team_b_mult; END IF;

  RETURN round(base * mult, 1);
END;
$$;

-- 5) Trigger que recalcula: pasar los multiplicadores
CREATE OR REPLACE FUNCTION public.recalc_predictions_for_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (new.score_a IS DISTINCT FROM old.score_a)
     OR (new.score_b IS DISTINCT FROM old.score_b)
     OR (new.status IS DISTINCT FROM old.status)
     OR (new.point_multiplier IS DISTINCT FROM old.point_multiplier)
     OR (new.team_a_multiplier IS DISTINCT FROM old.team_a_multiplier)
     OR (new.team_b_multiplier IS DISTINCT FROM old.team_b_multiplier) THEN
    UPDATE public.predictions p
      SET points = public.calc_points_match(
            p.pred_a, p.pred_b,
            new.score_a, new.score_b,
            new.team_a, new.team_b, new.stage,
            new.point_multiplier, new.team_a_multiplier, new.team_b_multiplier
          ),
          updated_at = now()
    WHERE p.match_id = new.id;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_predictions_match ON public.matches;
CREATE TRIGGER trg_recalc_predictions_match
AFTER UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.recalc_predictions_for_match();

-- 6) recalc_match_points: pasar multiplicadores
CREATE OR REPLACE FUNCTION public.recalc_match_points(_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int; v_match record;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT score_a, score_b, team_a, team_b, stage,
         point_multiplier, team_a_multiplier, team_b_multiplier
    INTO v_match FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  UPDATE public.predictions p
    SET points = public.calc_points_match(
          p.pred_a, p.pred_b,
          v_match.score_a, v_match.score_b,
          v_match.team_a, v_match.team_b, v_match.stage,
          v_match.point_multiplier, v_match.team_a_multiplier, v_match.team_b_multiplier
        ),
        updated_at = now()
  WHERE p.match_id = _match_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 7) Permitir a admin borrar incluso a otros admins
CREATE OR REPLACE FUNCTION public.delete_user_completely(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot delete yourself';
  END IF;
  DELETE FROM public.predictions WHERE user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

-- 8) Función para bloquear/desbloquear cuentas (incluso admin → otro admin)
CREATE OR REPLACE FUNCTION public.set_user_blocked(_user_id uuid, _blocked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'cannot block yourself'; END IF;
  UPDATE public.profiles SET is_blocked = _blocked, updated_at = now() WHERE id = _user_id;
END;
$$;

-- 9) Recalcular puntos existentes con los multiplicadores (default 1, no cambia nada)
UPDATE public.predictions p
SET points = public.calc_points_match(
  p.pred_a, p.pred_b, m.score_a, m.score_b, m.team_a, m.team_b, m.stage,
  m.point_multiplier, m.team_a_multiplier, m.team_b_multiplier
)
FROM public.matches m
WHERE m.id = p.match_id AND m.status = 'finished';
