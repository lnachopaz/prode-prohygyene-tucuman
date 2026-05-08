ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_in_ranking boolean NOT NULL DEFAULT true;
