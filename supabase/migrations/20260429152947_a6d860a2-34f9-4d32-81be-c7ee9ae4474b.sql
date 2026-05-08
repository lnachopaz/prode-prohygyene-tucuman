-- Crear usuario admin chueca@gmail.com (Ignacio Paz)
DO $$
DECLARE
  v_user_id uuid;
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM auth.users WHERE email = 'chueca@gmail.com';

  IF v_existing IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      'chueca@gmail.com',
      crypt('Prueba123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name','Ignacio Paz'),
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', 'chueca@gmail.com', 'email_verified', true),
      'email', v_user_id::text, now(), now(), now()
    );
  ELSE
    v_user_id := v_existing;
  END IF;

  -- Asegurar profile aprobado con display_name correcto
  INSERT INTO public.profiles (id, display_name, status)
  VALUES (v_user_id, 'Ignacio Paz', 'approved')
  ON CONFLICT (id) DO UPDATE SET display_name = 'Ignacio Paz', status = 'approved', updated_at = now();

  -- Asegurar rol admin
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'admin');
END $$;