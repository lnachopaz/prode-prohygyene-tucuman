CREATE TABLE public.match_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  minute integer NOT NULL DEFAULT 0,
  type text NOT NULL CHECK (type IN ('goal','yellow_card','red_card','substitution')),
  team text NOT NULL CHECK (team IN ('home','away')),
  player text,
  score_home integer,
  score_away integer,
  external_id text UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_match_events_match_id_minute ON public.match_events(match_id, minute);

ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_events_select_approved"
ON public.match_events FOR SELECT
TO authenticated
USING (public.is_approved(auth.uid()));

CREATE POLICY "match_events_admin_all"
ON public.match_events FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.match_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_events;