DROP POLICY IF EXISTS predictions_insert_own_unlocked ON public.predictions;
DROP POLICY IF EXISTS predictions_update_own_unlocked ON public.predictions;

CREATE POLICY predictions_insert_own_unlocked ON public.predictions
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_approved(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = predictions.match_id
      AND m.kickoff_at > (now() + interval '1 hour')
  )
);

CREATE POLICY predictions_update_own_unlocked ON public.predictions
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND public.is_approved(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = predictions.match_id
      AND m.kickoff_at > (now() + interval '1 hour')
  )
)
WITH CHECK (user_id = auth.uid());