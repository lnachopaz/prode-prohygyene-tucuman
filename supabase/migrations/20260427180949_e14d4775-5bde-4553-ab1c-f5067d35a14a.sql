-- Create user status enum
CREATE TYPE public.user_status AS ENUM ('pending', 'approved', 'rejected');

-- Add status column to profiles
ALTER TABLE public.profiles ADD COLUMN status public.user_status NOT NULL DEFAULT 'pending';

-- Approve all existing users
UPDATE public.profiles SET status = 'approved';

-- Update handle_new_user to set status based on admin code
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_display text;
  v_code text;
  v_is_admin boolean := false;
  v_status public.user_status;
begin
  v_display := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1));
  v_code := new.raw_user_meta_data->>'admin_code';

  if v_code is not null and length(v_code) > 0 then
    select exists(select 1 from public.admin_invite_codes where code = v_code and active) into v_is_admin;
  end if;

  v_status := case when v_is_admin then 'approved'::public.user_status else 'pending'::public.user_status end;

  insert into public.profiles (id, display_name, status) values (new.id, v_display, v_status);

  insert into public.user_roles (user_id, role)
  values (new.id, case when v_is_admin then 'admin'::app_role else 'user'::app_role end);

  return new;
end;
$function$;

-- Security definer function to check approval status
CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles where id = _user_id and status = 'approved'
  ) or public.has_role(_user_id, 'admin');
$function$;

-- Tighten predictions policies: only approved users can insert/update
DROP POLICY IF EXISTS predictions_insert_own_unlocked ON public.predictions;
CREATE POLICY predictions_insert_own_unlocked ON public.predictions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_approved(auth.uid())
    AND EXISTS (SELECT 1 FROM matches m WHERE m.id = predictions.match_id AND m.kickoff_at > (now() + interval '5 minutes'))
  );

DROP POLICY IF EXISTS predictions_update_own_unlocked ON public.predictions;
CREATE POLICY predictions_update_own_unlocked ON public.predictions
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_approved(auth.uid())
    AND EXISTS (SELECT 1 FROM matches m WHERE m.id = predictions.match_id AND m.kickoff_at > (now() + interval '5 minutes'))
  )
  WITH CHECK (user_id = auth.uid());