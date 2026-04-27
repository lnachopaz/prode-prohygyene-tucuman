
# Prode Mundial 2026 — ProHygiene

App web para que un grupo de amigos pronostique los partidos del Mundial 2026, con ranking, panel admin y partidos sincronizados desde TheSportsDB.

## Branding y diseño

- Logo ProHygiene en header y pantalla de login (lo guardo en `src/assets/`).
- Paleta minimalista: azul marino ProHygiene como primario, blanco y grises neutros, acentos sutiles para estados (verde acierto, ámbar pendiente, rojo error).
- Tipografía sans moderna (Inter) para look deportivo limpio.
- Toggle de modo oscuro opcional (persistido en localStorage), oscuro con fondo profundo y mismo azul de marca.
- Componentes Shadcn UI + Tailwind, diseño responsive mobile-first.

## Pantallas

1. **Login / Registro** — email + password (Supabase Auth), con logo PH centrado.
2. **Partidos / Pronósticos** — lista agrupada por fecha y fase (grupos, octavos, etc.). Cada card muestra banderas/nombres de selecciones, hora local, estado (programado / en vivo / finalizado) y dos inputs numéricos (Equipo A / Equipo B) + botón Guardar. Bloqueo automático **5 minutos antes del kickoff**: inputs deshabilitados y badge "Cerrado". Para partidos finalizados se muestra el resultado real, el pronóstico del usuario y los puntos obtenidos.
3. **Ranking** — tabla de todos los usuarios ordenada por puntos totales, con columnas: posición, nombre, aciertos exactos, aciertos de resultado, total. Resalta al usuario logueado.
4. **Mi perfil** — nombre visible, avatar opcional, mis pronósticos y puntos.
5. **Admin** (solo rol admin) — tabs:
   - Partidos: editar resultado real manualmente, forzar recálculo de puntos, sincronizar desde TheSportsDB.
   - Usuarios: ver lista, cambiar nombre visible, otorgar/revocar admin, eliminar.
   - Ajustes: regenerar código de invitación admin.
6. **Registro con código admin** — durante el registro hay un campo opcional "código de invitación"; si coincide con el código admin vigente, al usuario se le asigna rol `admin`.

## Lógica de puntos

Función SQL/edge que para cada pronóstico de partido finalizado compara contra el resultado real:
- 3 pts si goles exactos coinciden.
- 1 pt si acierta el signo (gana A, gana B, o empate) pero no los goles.
- 0 pts en otro caso.

Se ejecuta automáticamente cuando un partido se marca como finalizado (trigger) y también de forma manual desde admin.

## Integración TheSportsDB

- Edge function `sync-matches` que llama a TheSportsDB para traer fixtures y resultados del Mundial 2026 (ID de liga FIFA World Cup) y hace upsert en la tabla `matches`.
- Se invoca: (a) manualmente desde panel admin, (b) en un cron cada ~10 minutos para mantener resultados en vivo.
- Si TheSportsDB todavía no publicó el fixture del Mundial 2026 al momento de implementar, el admin puede cargar partidos manualmente y la sincronización completará campos cuando estén disponibles.

## Modelo de datos (Lovable Cloud / Supabase)

- `profiles` (id ↔ auth.users, display_name, avatar_url, created_at).
- `user_roles` (user_id, role enum `admin`|`user`) + función `has_role()` security definer.
- `matches` (id, external_id TheSportsDB, stage, group, team_a, team_b, team_a_flag, team_b_flag, kickoff_at, status, score_a, score_b, updated_at).
- `predictions` (id, user_id, match_id, pred_a, pred_b, points, locked, created_at, updated_at) — único por (user_id, match_id).
- `admin_invite_codes` (code, active, created_at) — un código vigente a la vez.
- Vista `leaderboard` que suma puntos por usuario.
- RLS: cada usuario lee/escribe solo sus pronósticos (y solo si el partido aún no está bloqueado), todos pueden leer matches y leaderboard, solo admins editan matches/usuarios.

## Detalles técnicos

- React + Vite + Tailwind + Shadcn UI, React Router, TanStack Query.
- Lovable Cloud para auth, base de datos y edge functions.
- Edge functions: `sync-matches`, `recalculate-points`, `validate-admin-code`.
- Cron de Supabase para `sync-matches` cada 10 minutos.
- Bloqueo de pronósticos validado tanto en UI como en RLS (chequeo de `kickoff_at - now() > 5 min`).

## Fuera de alcance (por ahora)

- Login social, notificaciones push, chat grupal, apuestas con dinero, multi-torneo. Se pueden agregar después.
