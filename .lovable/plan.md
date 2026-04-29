
## Objetivo

Dejar la base limpia (solo tu usuario `lnachopaz@gmail.com`), crear 100 usuarios de prueba con pronósticos para todos los partidos, marcar como **finalizados** los partidos cuya fecha ya pasó (con resultados aleatorios) y dejar **un partido en vivo** para ver cómo se mueve el ranking y la pantalla Live.

## Estado actual

- Usuarios en la DB: 5 (vos como admin + 4 usuarios reales: Cufa, Luis, Facu, Gustavo).
- Partidos: 104, todos `scheduled`, del 11/06/2026 al 19/07/2026 (todos en el futuro respecto al 29/04/2026).
- Como ningún partido es "pasado" todavía, vamos a **simular el avance del torneo** moviendo artificialmente fechas o, mejor, dejando las fechas tal cual y forzando estados/resultados directamente para la prueba.

## Plan

### 1. Limpiar usuarios reales (excepto el tuyo)

Borrar los 4 usuarios no-admin usando la función existente `delete_user_completely` (que ya limpia `predictions`, `user_roles`, `profiles` y `auth.users`). No se borra tu cuenta.

### 2. Crear 100 usuarios de prueba

- Insertarlos directo en `auth.users` con emails del estilo `test001@prode.test` … `test100@prode.test`, password genérico (ej: `Prode2026!`), `email_confirmed_at = now()` para que no necesiten verificar mail.
- El trigger `handle_new_user` les crea automáticamente el `profile` (status `pending`) y el `user_role` (`user`).
- Después, marcar todos esos profiles como `approved` para que puedan participar.
- Display names variados: "Test User 001", "Test User 002", etc. (o nombres random tipo "Juan P.", "María G."… te puedo poner nombres reales random si preferís).

### 3. Generar pronósticos para los 100 usuarios

Insertar en `predictions` un registro por cada combinación (usuario × partido) = **100 × 104 = 10.400 filas**, con `pred_a` y `pred_b` aleatorios entre 0 y 4 (distribución sesgada hacia 0–2 para que sea realista).

### 4. Simular partidos jugados y resultados

Como todos los partidos son a futuro, para que la prueba tenga sentido vamos a:

- Tomar los **primeros 30 partidos** (Jornadas 1 y parte de la 2) y marcarlos como `finished` con `score_a` / `score_b` aleatorios (0–4).
- Dejar **1 partido como `live`** con un marcador parcial (ej: 1-0) para que la pantalla **Live** muestre el partido en curso y el "puntaje parcial" de cada usuario.
- El resto queda `scheduled` para seguir viendo la pantalla de Pronósticos.

El trigger `recalc_predictions_for_match` se dispara automáticamente al actualizar el score y recalcula los puntos de los 100 usuarios para cada partido finalizado, así que el **Ranking** se llena solo.

### 5. Verificación

Después de cargar todo, consulto:
- Cantidad de usuarios aprobados (debe ser 101: vos + 100).
- Cantidad de pronósticos (10.400).
- Top 10 del ranking calculado.
- Partido en vivo + pronósticos para ese partido.

Te confirmo los números antes de que abras la app.

## Detalles técnicos

```text
1. SQL (insert tool):
   - SELECT delete_user_completely(id) para los 4 user_ids no-admin.

2. SQL (insert tool, una sola query con generate_series):
   INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                           raw_user_meta_data, aud, role, instance_id, created_at, updated_at)
   SELECT gen_random_uuid(),
          'test' || lpad(n::text, 3, '0') || '@prode.test',
          crypt('Prode2026!', gen_salt('bf')),
          now(),
          jsonb_build_object('display_name', 'Test User ' || lpad(n::text, 3, '0')),
          'authenticated', 'authenticated',
          '00000000-0000-0000-0000-000000000000', now(), now()
   FROM generate_series(1, 100) n;
   -- el trigger handle_new_user crea profiles + user_roles

3. UPDATE profiles SET status='approved'
   WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'test%@prode.test');

4. INSERT INTO predictions (user_id, match_id, pred_a, pred_b)
   SELECT u.id, m.id,
          floor(random() * 4)::int,
          floor(random() * 4)::int
   FROM auth.users u
   CROSS JOIN matches m
   WHERE u.email LIKE 'test%@prode.test';

5. Marcar 30 partidos como finished con scores random:
   WITH first30 AS (
     SELECT id FROM matches ORDER BY kickoff_at LIMIT 30
   )
   UPDATE matches SET status='finished',
                      score_a = floor(random()*4)::int,
                      score_b = floor(random()*4)::int
   WHERE id IN (SELECT id FROM first30);
   -- el trigger recalcula points en predictions

6. Marcar el partido #31 como live con 1-0:
   UPDATE matches SET status='live', score_a=1, score_b=0
   WHERE id = (SELECT id FROM matches
               WHERE status='scheduled' ORDER BY kickoff_at LIMIT 1);
```

> Nota: insertar directo en `auth.users` con `crypt()` requiere la extensión `pgcrypto` (ya viene activa en Supabase). Los 100 usuarios podrán loguearse con `Prode2026!` por si querés probar con alguno.

## Limpieza posterior

Cuando termines la prueba y quieras volver al estado real, decime "limpiá los usuarios de prueba" y armo otra migración que:
- Borra todos los usuarios cuyo email termine en `@prode.test` (con sus predictions).
- Resetea status/score de los partidos a `scheduled` / `null`.

## Riesgos y consideraciones

- Estás insertando datos directamente en `auth.users`. Es seguro porque controlamos el formato, pero igual lo hago en una migración separada para que puedas revisar.
- Los 100 usuarios cuentan para tu cuota de Lovable Cloud (auth users), pero 100 es trivial.
- Una vez que el trigger `recalc_predictions_for_match` corre sobre 10.400 predicciones × 30 partidos, puede tardar unos segundos. Es normal.
