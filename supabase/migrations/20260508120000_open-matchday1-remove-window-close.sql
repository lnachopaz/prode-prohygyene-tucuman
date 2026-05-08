-- Fecha 1 disponible desde ya
UPDATE public.prediction_windows
SET opens_at = '2026-05-08T00:00:00Z'
WHERE id = 'matchday-1';

-- Eliminar el check de closes_at de las políticas RLS de predictions.
-- Regla nueva: la ventana sólo controla cuándo ABRE; el cierre lo maneja
-- la condición kickoff_at > now() + 1 hour (1 hora antes del partido).
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
              OR now() >= w.opens_at
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
              OR now() >= w.opens_at
            )
          )
        )
    )
  )
  WITH CHECK (user_id = auth.uid());
