DO $$
DECLARE
  i int;
  v_user_id uuid;
  v_email text;
  v_name text;
  v_match_id uuid := '4e721f40-13b9-402c-b31a-325eec3d977d';
  v_pred_a int;
  v_pred_b int;
  v_scores int[][] := ARRAY[
    -- 60% bajos (12 entradas)
    ARRAY[0,0],ARRAY[1,0],ARRAY[0,1],ARRAY[1,1],ARRAY[2,1],ARRAY[1,2],
    ARRAY[2,0],ARRAY[0,2],ARRAY[2,2],ARRAY[1,1],ARRAY[1,0],ARRAY[0,1],
    -- 30% medios (6 entradas)
    ARRAY[3,1],ARRAY[1,3],ARRAY[3,2],ARRAY[2,3],ARRAY[3,1],ARRAY[2,3],
    -- 10% altos (2 entradas)
    ARRAY[3,0],ARRAY[4,1]
  ];
  v_idx int;
BEGIN
  FOR i IN 1..100 LOOP
    v_email := 'loadtest+' || i || '@prode.test';
    v_name := 'LoadTest ' || lpad(i::text, 3, '0');

    -- Saltar si ya existe
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id, 'authenticated', 'authenticated',
        v_email,
        crypt('LoadTest123!', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', v_name),
        now(), now(), '', '', '', ''
      );

      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
        'email', v_user_id::text, now(), now(), now()
      );
    END IF;

    -- Asegurar profile aprobado
    INSERT INTO public.profiles (id, display_name, status)
    VALUES (v_user_id, v_name, 'approved')
    ON CONFLICT (id) DO UPDATE SET status='approved', display_name=v_name, updated_at=now();

    -- Asegurar rol user
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=v_user_id) THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'user');
    END IF;

    -- Predicción aleatoria realista
    v_idx := 1 + floor(random() * array_length(v_scores, 1))::int;
    v_pred_a := v_scores[v_idx][1];
    v_pred_b := v_scores[v_idx][2];

    INSERT INTO public.predictions (user_id, match_id, pred_a, pred_b)
    VALUES (v_user_id, v_match_id, v_pred_a, v_pred_b)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;