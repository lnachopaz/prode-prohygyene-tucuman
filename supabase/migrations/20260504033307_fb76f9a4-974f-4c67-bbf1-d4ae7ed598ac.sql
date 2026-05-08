
DROP VIEW IF EXISTS public.leaderboard;
DROP FUNCTION IF EXISTS public.calc_points(integer,integer,integer,integer);
DROP FUNCTION IF EXISTS public.calc_points_match(integer,integer,integer,integer,text,text,text);

ALTER TABLE public.predictions ALTER COLUMN points DROP DEFAULT;
ALTER TABLE public.predictions ALTER COLUMN points TYPE numeric(6,1) USING points::numeric;
ALTER TABLE public.predictions ALTER COLUMN points SET DEFAULT 0;

CREATE FUNCTION public.calc_points(pa integer, pb integer, sa integer, sb integer)
 RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  select case
    when sa is null or sb is null then 0::numeric
    when pa = sa and pb = sb then 3::numeric
    when sign(pa - pb) = sign(sa - sb) then 1::numeric
    else 0::numeric
  end;
$$;

CREATE FUNCTION public.calc_points_match(pa integer, pb integer, sa integer, sb integer, team_a text, team_b text, stage text)
 RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
declare
  base numeric; mult numeric := 1;
  s text := lower(coalesce(stage, ''));
  ta text := lower(coalesce(team_a, ''));
  tb text := lower(coalesce(team_b, ''));
  is_final boolean; is_semi_or_third boolean; is_quarter boolean; is_round_of_16 boolean;
begin
  if sa is null or sb is null then return 0;
  elsif pa = sa and pb = sb then base := 3;
  elsif sign(pa - pb) = sign(sa - sb) then base := 1;
  else base := 0;
  end if;
  if base = 0 then return 0; end if;
  if ta like '%argentina%' or tb like '%argentina%' then mult := mult * 2; end if;
  is_final := (s like '%final%') and (s not like '%semi%') and (s not like '%tercer%') and (s not like '%third%')
    and (s not like '%1/2%') and (s not like '%cuarto%') and (s not like '%quarter%')
    and (s not like '%octavo%') and (s not like '%dieciseis%')
    and (s not like '%round of 16%') and (s not like '%last 16%')
    and (s not like '%round of 32%') and (s not like '%last 32%');
  is_semi_or_third := (not is_final) and (s like '%semi%' or s like '%tercer%' or s like '%third%' or s like '%1/2%');
  is_quarter := (not is_final) and (not is_semi_or_third) and (s like '%cuarto%' or s like '%quarter%');
  is_round_of_16 := (not is_final) and (not is_semi_or_third) and (not is_quarter) and (s like '%octavo%' or s like '%round of 16%' or s like '%last 16%');
  if is_final then mult := mult * 2;
  elsif is_semi_or_third then mult := mult * 1.5;
  elsif is_quarter then mult := mult * 1.2;
  elsif is_round_of_16 then mult := mult * 1.2;
  end if;
  return round(base * mult, 1);
end;
$$;

-- Recreate dependent functions that reference calc_points_match (signature change recreated them via OR REPLACE; since DROP, recreate)
CREATE OR REPLACE FUNCTION public.recalc_predictions_for_match()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  if (new.score_a is distinct from old.score_a)
     or (new.score_b is distinct from old.score_b)
     or (new.status is distinct from old.status) then
    update public.predictions p
      set points = public.calc_points_match(p.pred_a, p.pred_b, new.score_a, new.score_b, new.team_a, new.team_b, new.stage),
          updated_at = now()
    where p.match_id = new.id;
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.recalc_match_points(_match_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_count int; v_match record;
begin
  if not has_role(auth.uid(), 'admin'::app_role) then raise exception 'not authorized'; end if;
  select score_a, score_b, team_a, team_b, stage into v_match from public.matches where id = _match_id;
  if not found then raise exception 'match not found'; end if;
  update public.predictions p
    set points = public.calc_points_match(p.pred_a, p.pred_b, v_match.score_a, v_match.score_b, v_match.team_a, v_match.team_b, v_match.stage),
        updated_at = now()
  where p.match_id = _match_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

CREATE VIEW public.leaderboard WITH (security_invoker=on) AS
SELECT pr.id AS user_id, pr.display_name, pr.avatar_url,
    COALESCE(sum(p.points), 0)::numeric(10,1) AS total_points,
    COALESCE(sum(CASE WHEN m.score_a IS NOT NULL AND m.score_b IS NOT NULL AND p.pred_a = m.score_a AND p.pred_b = m.score_b THEN 1 ELSE 0 END), 0)::integer AS exact_hits,
    COALESCE(sum(CASE WHEN m.score_a IS NOT NULL AND m.score_b IS NOT NULL AND NOT (p.pred_a = m.score_a AND p.pred_b = m.score_b) AND sign((p.pred_a - p.pred_b)::double precision) = sign((m.score_a - m.score_b)::double precision) THEN 1 ELSE 0 END), 0)::integer AS result_hits,
    count(p.id)::integer AS predictions_count
FROM profiles pr
  LEFT JOIN predictions p ON p.user_id = pr.id
  LEFT JOIN matches m ON m.id = p.match_id AND m.status = 'finished'::match_status
WHERE pr.status = 'approved'::user_status
GROUP BY pr.id, pr.display_name, pr.avatar_url;

GRANT SELECT ON public.leaderboard TO authenticated, anon;

UPDATE public.predictions p
SET points = public.calc_points_match(p.pred_a, p.pred_b, m.score_a, m.score_b, m.team_a, m.team_b, m.stage)
FROM public.matches m WHERE m.id = p.match_id;
