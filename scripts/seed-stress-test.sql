-- ============================================================
-- seed-stress-test.sql
-- Crea 500 usuarios de prueba (loadtest+1..500@prode.test)
-- con contraseña LoadTest123! y pronósticos para todos los partidos.
--
-- Ejecutar en: Supabase SQL Editor
-- Duración estimada: 10-30 segundos
-- ============================================================

DO $$
DECLARE
  v_hash  text;
  v_id    uuid;
  v_email text;
  v_exist uuid;
  i       int;
BEGIN
  -- Hash computado UNA vez con cost 4 (rápido para seeds; 500 × bcrypt bf8 = timeout)
  v_hash := crypt('LoadTest123!', gen_salt('bf', 4));

  FOR i IN 1..500 LOOP
    v_email := format('loadtest+%s@prode.test', i);
    SELECT id INTO v_exist FROM auth.users WHERE email = v_email;

    IF v_exist IS NULL THEN
      v_id := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_id, 'authenticated', 'authenticated',
        v_email, v_hash,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', format('TestUser %s', i)),
        now(), now(), '', '', '', ''
      );

      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_id,
        jsonb_build_object(
          'sub', v_id::text, 'email', v_email, 'email_verified', true
        ),
        'email', v_id::text, now(), now(), now()
      );
    ELSE
      v_id := v_exist;
    END IF;

    -- Perfil: aprobado
    UPDATE public.profiles
    SET status = 'approved', updated_at = now()
    WHERE id = v_id;

  END LOOP;

  RAISE NOTICE 'Usuarios de prueba listos: 500';
END $$;

-- ----------------------------------------------------------------
-- Pronósticos para todos los partidos
-- CTE garantiza que pred_a/pred_b sean consistentes con el cálculo de points
-- ----------------------------------------------------------------
WITH candidates AS (
  SELECT
    u.id                        AS user_id,
    m.id                        AS match_id,
    (floor(random() * 5))::int  AS pred_a,
    (floor(random() * 5))::int  AS pred_b,
    m.status,
    m.score_a,
    m.score_b,
    m.team_a,
    m.team_b,
    m.stage,
    m.point_multiplier,
    m.team_a_multiplier,
    m.team_b_multiplier
  FROM auth.users u
  CROSS JOIN public.matches m
  WHERE u.email LIKE 'loadtest+%@prode.test'
)
INSERT INTO public.predictions (user_id, match_id, pred_a, pred_b, points)
SELECT
  user_id,
  match_id,
  pred_a,
  pred_b,
  CASE
    WHEN status = 'finished' THEN
      public.calc_points_match(
        pred_a, pred_b,
        score_a, score_b,
        team_a, team_b, stage,
        point_multiplier, team_a_multiplier, team_b_multiplier
      )::int
    ELSE 0
  END
FROM candidates
ON CONFLICT (user_id, match_id) DO NOTHING;

-- Verificación rápida
SELECT
  (SELECT COUNT(*) FROM auth.users WHERE email LIKE 'loadtest+%@prode.test')    AS usuarios_test,
  (SELECT COUNT(*) FROM public.predictions
   WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'loadtest+%@prode.test')) AS predicciones_test;
