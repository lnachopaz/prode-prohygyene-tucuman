ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS venue text;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS venue_tz text;