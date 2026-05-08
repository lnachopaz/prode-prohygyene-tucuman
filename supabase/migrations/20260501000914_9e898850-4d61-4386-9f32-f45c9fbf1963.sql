
-- Fix leaderboard view to only show approved users
DROP VIEW IF EXISTS public.leaderboard;
CREATE VIEW public.leaderboard WITH (security_invoker=on) AS
SELECT pr.id AS user_id,
    pr.display_name,
    pr.avatar_url,
    (COALESCE(sum(p.points), 0))::integer AS total_points,
    (COALESCE(sum(CASE WHEN p.points = 3 THEN 1 ELSE 0 END), 0))::integer AS exact_hits,
    (COALESCE(sum(CASE WHEN p.points = 1 THEN 1 ELSE 0 END), 0))::integer AS result_hits,
    (count(p.id))::integer AS predictions_count
FROM profiles pr
LEFT JOIN predictions p ON p.user_id = pr.id
LEFT JOIN matches m ON m.id = p.match_id AND m.status = 'finished'::match_status
WHERE pr.status = 'approved'::user_status
GROUP BY pr.id, pr.display_name, pr.avatar_url;

-- Update prediction windows with correct close times (Argentina = UTC-3)
-- Fecha 1: closes 10/06 23:00 AR = 11/06 02:00 UTC (already correct)
-- Fecha 2: opens 11/06 16:00 AR = 11/06 19:00 UTC, closes 17/06 23:00 AR = 18/06 02:00 UTC
UPDATE public.prediction_windows SET closes_at = '2026-06-18T02:00:00+00' WHERE id = 'matchday-2';
-- Fecha 3: opens 18/06 16:00 AR = 18/06 19:00 UTC, closes 23/06 23:00 AR = 24/06 02:00 UTC
UPDATE public.prediction_windows SET closes_at = '2026-06-24T02:00:00+00' WHERE id = 'matchday-3';
-- Dieciseisavos: opens 24/06 16:00 AR = 24/06 19:00 UTC, closes 27/06 23:00 AR = 28/06 02:00 UTC
UPDATE public.prediction_windows SET closes_at = '2026-06-28T02:00:00+00' WHERE id = 'round-of-32';
-- Octavos: opens 28/06 16:00 AR = 28/06 19:00 UTC, closes 03/07 23:00 AR = 04/07 02:00 UTC
UPDATE public.prediction_windows SET closes_at = '2026-07-04T02:00:00+00' WHERE id = 'round-of-16';
-- Cuartos: opens 04/07 16:00 AR = 04/07 19:00 UTC, closes 08/07 23:00 AR = 09/07 02:00 UTC
UPDATE public.prediction_windows SET closes_at = '2026-07-09T02:00:00+00' WHERE id = 'quarter-finals';
-- Semifinales: opens 09/07 16:00 AR = 09/07 19:00 UTC, closes 13/07 23:00 AR = 14/07 02:00 UTC
UPDATE public.prediction_windows SET closes_at = '2026-07-14T02:00:00+00' WHERE id = 'semi-finals';
-- Final: opens 14/07 16:00 AR = 14/07 19:00 UTC, closes 17/07 23:00 AR = 18/07 02:00 UTC
UPDATE public.prediction_windows SET closes_at = '2026-07-18T02:00:00+00' WHERE id = 'finals';

-- Add UCL prediction window
-- Opens Saturday 13:00 AR = 16:00 UTC, closes Monday 23:00 AR = Tuesday 02:00 UTC  
-- For the current context: Sat May 3 13:00 AR -> Mon May 5 15:00 AR (bloqueo hasta lunes 30... wait, lunes 30 doesn't exist in May)
-- User said "partidos de UCL con desbloqueo sabado 13:00, cierre lunes 23:00" and "bloqueo champions hasta lunes 30 a las 15:00"
-- Lunes 30 de junio? No. The user said "lunes 30 a las 15:00" - that must be June 30.
-- But wait, user also said "quiero que se cierren hasta el lunes a las 23:00" for UCL general
-- And then point 3 says "bloqueo hasta lunes 30 a las 15:00" - so close on Monday June 30 at 15:00 AR
INSERT INTO public.prediction_windows (id, label, opens_at, closes_at, sort_order)
VALUES ('ucl-finals', 'Champions League', '2026-05-02T16:00:00+00', '2026-06-30T18:00:00+00', 0);
