CREATE POLICY "predictions_select_locked_match"
ON public.predictions
FOR SELECT
TO authenticated
USING (
  public.is_approved(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = predictions.match_id
      AND (m.status <> 'scheduled' OR m.kickoff_at <= now() + interval '1 hour')
  )
);