
-- 1) Crear trigger en auth.users para que handle_new_user se ejecute al crear cuenta
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Recrear leaderboard view con conteo correcto de plenos/resultados
--    y exposicion de campos para tiebreakers
DROP VIEW IF EXISTS public.leaderboard;
CREATE VIEW public.leaderboard AS
SELECT
  pr.id AS user_id,
  pr.display_name,
  pr.avatar_url,
  COALESCE(SUM(p.points), 0)::integer AS total_points,
  COALESCE(SUM(
    CASE WHEN m.score_a IS NOT NULL AND m.score_b IS NOT NULL
              AND p.pred_a = m.score_a AND p.pred_b = m.score_b
         THEN 1 ELSE 0 END
  ), 0)::integer AS exact_hits,
  COALESCE(SUM(
    CASE WHEN m.score_a IS NOT NULL AND m.score_b IS NOT NULL
              AND NOT (p.pred_a = m.score_a AND p.pred_b = m.score_b)
              AND sign(p.pred_a - p.pred_b) = sign(m.score_a - m.score_b)
         THEN 1 ELSE 0 END
  ), 0)::integer AS result_hits,
  COUNT(p.id)::integer AS predictions_count
FROM public.profiles pr
LEFT JOIN public.predictions p ON p.user_id = pr.id
LEFT JOIN public.matches m ON m.id = p.match_id AND m.status = 'finished'::match_status
WHERE pr.status = 'approved'::user_status
GROUP BY pr.id, pr.display_name, pr.avatar_url;

GRANT SELECT ON public.leaderboard TO authenticated, anon;

-- 3) Ajustar ventana ucl-finals: sábado 02/05 13:00 AR (16:00 UTC) -> lunes 04/05 23:00 AR (martes 05/05 02:00 UTC)
UPDATE public.prediction_windows
   SET opens_at  = '2026-05-02T16:00:00+00',
       closes_at = '2026-05-05T02:00:00+00'
 WHERE id = 'ucl-finals';

-- 4) Insertar partidos UCL (semifinales vuelta y final)
INSERT INTO public.matches (external_id, stage, team_a, team_b, kickoff_at, prediction_window_id, status)
VALUES
  ('cl-552095', 'UEFA Champions League · Semifinal (Vuelta)', 'Arsenal',          'Atlético de Madrid',  '2026-05-05T19:00:00+00', 'ucl-finals', 'scheduled'),
  ('cl-552094', 'UEFA Champions League · Semifinal (Vuelta)', 'Bayern Múnich',    'Paris Saint-Germain', '2026-05-06T19:00:00+00', 'ucl-finals', 'scheduled'),
  ('cl-552096', 'UEFA Champions League · Final',              'Por definir',      'Por definir',         '2026-05-30T16:00:00+00', 'ucl-finals', 'scheduled')
ON CONFLICT (external_id) DO UPDATE SET
  kickoff_at = EXCLUDED.kickoff_at,
  prediction_window_id = EXCLUDED.prediction_window_id,
  stage = EXCLUDED.stage;
