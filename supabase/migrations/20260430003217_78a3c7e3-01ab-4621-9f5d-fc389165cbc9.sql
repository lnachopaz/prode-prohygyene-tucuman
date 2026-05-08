-- 1) Borrar todos los datos de usuarios
DELETE FROM public.predictions;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;
DELETE FROM auth.identities;
DELETE FROM auth.users;

-- 2) Crear el nuevo usuario admin directamente en auth.users
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    'lnachopaz@gmail.com',
    crypt('Batuque1277', gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
    jsonb_build_object('display_name','Ignacio Paz'),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', 'lnachopaz@gmail.com', 'email_verified', true),
    'email',
    now(),
    now(),
    now()
  );

  -- Perfil aprobado
  INSERT INTO public.profiles (id, display_name, status)
  VALUES (v_user_id, 'Ignacio Paz', 'approved')
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, status = 'approved';

  -- Rol admin
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin')
  ON CONFLICT DO NOTHING;
END $$;