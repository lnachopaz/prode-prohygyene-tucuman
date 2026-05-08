
ALTER TABLE public.predictions DROP CONSTRAINT IF EXISTS predictions_user_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.predictions
  ADD CONSTRAINT predictions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
