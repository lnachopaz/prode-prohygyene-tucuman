-- 1) Tabla de ventanas de carga de pronósticos
CREATE TABLE public.prediction_windows (
  id text PRIMARY KEY,
  label text NOT NULL,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prediction_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "windows_select_authenticated"
  ON public.prediction_windows FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "windows_admin_all"
  ON public.prediction_windows FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Cargar las 8 ventanas (timestamps en UTC = AR + 3h)
-- F1: hasta 10/06 23:00 AR  -> closes 11/06 02:00 UTC, opens "ahora" (usamos 2026-06-01)
INSERT INTO public.prediction_windows (id, label, opens_at, closes_at, sort_order) VALUES
  ('matchday-1',  'Fecha 1 (fase de grupos)',     '2026-06-01T00:00:00Z', '2026-06-11T02:00:00Z', 1),
  ('matchday-2',  'Fecha 2 (fase de grupos)',     '2026-06-11T19:00:00Z', '2026-06-18T02:00:00Z', 2),
  ('matchday-3',  'Fecha 3 (fase de grupos)',     '2026-06-18T19:00:00Z', '2026-06-24T02:00:00Z', 3),
  ('round-of-32', 'Dieciseisavos de final',       '2026-06-24T19:00:00Z', '2026-06-28T02:00:00Z', 4),
  ('round-of-16', 'Octavos de final',             '2026-06-28T19:00:00Z', '2026-07-04T02:00:00Z', 5),
  ('quarter-finals','Cuartos de final',           '2026-07-04T19:00:00Z', '2026-07-09T02:00:00Z', 6),
  ('semi-finals', 'Semifinales',                  '2026-07-09T19:00:00Z', '2026-07-14T02:00:00Z', 7),
  ('finals',      'Final y 3° puesto',            '2026-07-14T19:00:00Z', '2026-07-18T02:00:00Z', 8);

-- 2) Vincular partidos a su ventana
ALTER TABLE public.matches ADD COLUMN prediction_window_id text REFERENCES public.prediction_windows(id);
CREATE INDEX idx_matches_window ON public.matches(prediction_window_id);

-- 3) Reemplazar políticas de predictions para sumar la regla de ventana abierta
DROP POLICY IF EXISTS predictions_insert_own_unlocked ON public.predictions;
DROP POLICY IF EXISTS predictions_update_own_unlocked ON public.predictions;

CREATE POLICY "predictions_insert_own_unlocked"
  ON public.predictions FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_approved(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.matches m
      LEFT JOIN public.prediction_windows w ON w.id = m.prediction_window_id
      WHERE m.id = predictions.match_id
        AND m.predictions_lock_mode <> 'force_closed'
        AND (
          m.predictions_lock_mode = 'force_open'
          OR (
            m.predictions_lock_mode = 'auto'
            AND m.kickoff_at > (now() + interval '1 hour')
            AND (
              m.prediction_window_id IS NULL
              OR (now() >= w.opens_at AND now() <= w.closes_at)
            )
          )
        )
    )
  );

CREATE POLICY "predictions_update_own_unlocked"
  ON public.predictions FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND is_approved(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.matches m
      LEFT JOIN public.prediction_windows w ON w.id = m.prediction_window_id
      WHERE m.id = predictions.match_id
        AND m.predictions_lock_mode <> 'force_closed'
        AND (
          m.predictions_lock_mode = 'force_open'
          OR (
            m.predictions_lock_mode = 'auto'
            AND m.kickoff_at > (now() + interval '1 hour')
            AND (
              m.prediction_window_id IS NULL
              OR (now() >= w.opens_at AND now() <= w.closes_at)
            )
          )
        )
    )
  )
  WITH CHECK (user_id = auth.uid());