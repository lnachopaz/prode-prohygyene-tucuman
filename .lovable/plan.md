## Objetivo

Preparar el entorno para una prueba de carga real con 100 usuarios concurrentes prediciendo Arsenal vs Atlético de Madrid (UCL hoy), y dejar tu cuenta `chueca@gmail.com` (Ignacio Paz) como administradora.

---

## 1) Crear admin `chueca@gmail.com` — Ignacio Paz

- Crear el usuario en `auth.users` con email confirmado y password `Prueba123` usando una migración con `crypt()` / `gen_salt('bf')` (la función `handle_new_user` creará el `profile` automáticamente).
- Forzar `display_name = 'Ignacio Paz'` y `status = 'approved'` en `profiles`.
- Insertar `('user_id', 'admin')` en `user_roles`.
- Verificar con un `SELECT` que el usuario quede como admin aprobado.

> Nota: la contraseña `Prueba123` quedará registrada en la migración. Te recomiendo cambiarla desde Profile después del primer login.

---

## 2) Cargar partido Arsenal vs Atlético Madrid (UCL hoy)

- Invocar la edge function `sync-live-matches` (que ya tiene lógica para detectar partidos UCL del día vía Football-Data y crearlos con `external_id`, banderas y `kickoff_at` reales).
- Verificar en `matches` que el partido aparezca con `stage='UEFA Champions League'`, `status` correcto y banderas.
- Si por algún motivo la API no lo devuelve hoy (rate-limit / fixture no listado), fallback: insertarlo a mano con `team_a='Arsenal FC'`, `team_b='Atlético de Madrid'`, banderas conocidas, `kickoff_at` del fixture real y `external_id=null` (modo manual, sin auto-sync).

---

## 3) Crear 100 usuarios reales aprobados con predicciones

Una sola migración SQL con bloque `DO $$ ... $$`:

- Insertar 100 filas en `auth.users`:
  - email: `loadtest+1@prode.test` … `loadtest+100@prode.test`
  - password: `LoadTest123!` (hash bcrypt vía `crypt()`)
  - `email_confirmed_at = now()` para que puedan loguearse sin verificar.
  - `raw_user_meta_data = {"display_name": "LoadTest 001"}`.
- El trigger `handle_new_user` les creará perfil + rol `user`.
- `UPDATE profiles SET status='approved'` para los 100.
- Insertar 1 predicción por usuario para el partido Arsenal vs Atleti con **distribución realista**:
  - 60% marcadores 0–2 (0-0, 1-0, 0-1, 1-1, 2-1, 1-2, 2-0, 0-2, 2-2)
  - 30% marcadores 2-3 goles totales (3-1, 1-3, 3-2, 2-3)
  - 10% goleadas (3-0, 0-3, 4-1, 1-4, 4-0)
- RLS no bloquea porque la migración corre como service role.

---

## 4) Probar concurrencia con esos 100 usuarios

Crear un script de carga local (no se sube como feature de la app, queda en `/scripts/loadtest.ts`) usando el SDK de Supabase:

- Loguea N usuarios en paralelo (`signInWithPassword`).
- Cada sesión abre un canal Realtime sobre `matches` y dispara queries periódicas a `matches`, `predictions`, `leaderboard` simulando la pestaña Live.
- Logs por consola: latencia media, errores, throughput.
- Parámetros configurables: `CONCURRENCY` (ej. 100), `DURATION_SEC`, `POLL_MS`.
- Se ejecuta con `bun run scripts/loadtest.ts`.

Esto te permite ver en tiempo real (en tu sesión admin) cómo responde la UI mientras los 100 usuarios consumen datos.

---

## Detalles técnicos

**Orden de ejecución (3 migraciones + 1 invocación + 1 archivo):**

1. Migración: crear admin `chueca@gmail.com`.
2. Invocar edge function `sync-live-matches` para traer Arsenal vs Atleti.
3. Migración: crear los 100 usuarios `loadtest+N@prode.test` aprobados.
4. Migración: insertar las 100 predicciones (después de confirmar el `match.id` correcto).
5. Crear `scripts/loadtest.ts` y `scripts/README.md` con instrucciones de uso.

**Tablas tocadas:** `auth.users` (insert directo, password hasheada con bcrypt), `public.profiles` (update status), `public.user_roles` (insert admin), `public.predictions` (insert x100), `public.matches` (vía edge function o fallback manual).

**Limpieza posterior:** te dejaré también un snippet SQL para borrar los 100 usuarios de prueba con `delete_user_completely()` cuando termines la prueba.

---

## Riesgos / consideraciones

- Insertar en `auth.users` directo es soportado pero sensible: lo haré con los campos exactos que usa Supabase Auth (`instance_id`, `aud='authenticated'`, `role='authenticated'`, `encrypted_password=crypt(...,gen_salt('bf'))`, `email_confirmed_at`, `raw_app_meta_data`, `raw_user_meta_data`).
- Football-Data free tier: 10 req/min. La edge function ya lo respeta.
- 100 sesiones concurrentes desde una sola máquina pueden saturar tu red local antes que Supabase; el script lo hará igual y reportará latencias reales del backend.
