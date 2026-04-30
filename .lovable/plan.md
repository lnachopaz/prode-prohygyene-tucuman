## Objetivo

1. Crear el usuario admin **Ignacio Paz** (ignacio.paz@prohygiene.com).
2. Importar los **104 partidos del Mundial 2026** desde Football-Data.org (ya verificado: la API devuelve los 104 con fechas, equipos y escudos).
3. Importar los partidos de **UCL de la próxima semana** (semifinales ida: Arsenal–Atlético 5/5 y Bayern–PSG 6/5).
4. Configurar **ventanas de pronóstico** por fase para el Mundial con los plazos pedidos.

---

## 1. Crear admin Ignacio Paz

Pasos:
- Generar un código de invitación admin nuevo en `admin_invite_codes` (ej: `IGNACIO-PAZ-2026`).
- Crear el usuario vía `auth.admin.createUser` con email confirmado, password `Batuque1277` y `raw_user_meta_data = { display_name: "Ignacio Paz", admin_code: "IGNACIO-PAZ-2026" }`. El trigger `handle_new_user` lo marca automáticamente como `admin` + `approved`.
- Lo haré desde una edge function de un solo uso (`bootstrap-admin`) que use el `SUPABASE_SERVICE_ROLE_KEY`, la invocaré una vez y luego la dejo lista por si se necesita.

> Alternativa: crearlo directo con el endpoint admin de Supabase desde el sandbox. Voy a usar la edge function porque es más limpio y queda auditable.

---

## 2. Ventanas de pronóstico (prediction_windows)

Mapeo exacto de fechas pedidas → ventanas que se aplican a cada partido por fase:

| ID ventana       | Label                  | Abre (ART)        | Cierra                                  | Aplica a stage                 |
|------------------|------------------------|-------------------|-----------------------------------------|--------------------------------|
| `wc-md1`         | Fecha 1 - Grupos       | 31/05 00:00       | 10/06 23:59                             | GROUP_STAGE matchday 1         |
| `wc-md2`         | Fecha 2 - Grupos       | 11/06 00:00       | 1h antes del kickoff de cada partido*   | GROUP_STAGE matchday 2         |
| `wc-md3`         | Fecha 3 - Grupos       | 18/06 00:00       | 1h antes del kickoff*                   | GROUP_STAGE matchday 3         |
| `wc-r32`         | 16avos de final        | 24/06 00:00       | 1h antes del kickoff*                   | LAST_32                        |
| `wc-r16`         | Octavos de final       | 28/06 00:00       | 1h antes del kickoff*                   | LAST_16                        |
| `wc-qf`          | Cuartos de final       | 04/07 00:00       | 1h antes del kickoff*                   | QUARTER_FINALS                 |
| `wc-sf`          | Semifinales            | 09/07 00:00       | 1h antes del kickoff*                   | SEMI_FINALS                    |
| `wc-final`       | Final + 3er puesto     | 14/07 00:00       | 1h antes del kickoff*                   | FINAL + THIRD_PLACE            |

\* Como `prediction_windows` solo tiene `opens_at`/`closes_at` globales, voy a setear `closes_at` al inicio del último partido de la fase. El cierre 1h antes por partido ya lo hace el RLS automáticamente con `m.kickoff_at > now() + 1h` en modo `auto`. Así combinamos: la ventana abre la carga progresiva y el bloqueo 1h-pre-partido funciona por partido.

Todas se insertan en `prediction_windows` con `sort_order` 1–8.

---

## 3. Importar partidos

### 3a. Mundial (104 partidos)

- Llamada única a `GET /v4/competitions/WC/matches` (Football-Data).
- Por cada partido inserto en `matches`:
  - `external_id` = `fd-<id>`
  - `stage` = mapeo legible: `GROUP_STAGE` → `Group Stage`, `LAST_32` → `Dieciseisavos`, `LAST_16` → `Octavos`, `QUARTER_FINALS` → `Cuartos`, `SEMI_FINALS` → `Semifinal`, `THIRD_PLACE` → `Tercer Puesto`, `FINAL` → `Final`. Esto importa porque `calc_points_match` detecta la fase por el texto del stage para aplicar multiplicadores (x1.2 knockout, x3 final).
  - `group_name` = `GROUP_A`...`GROUP_L` (solo en fase de grupos).
  - `team_a`, `team_b`, `team_a_flag`, `team_b_flag` desde la API.
  - `kickoff_at` = `utcDate`.
  - `prediction_window_id` = la ventana correspondiente según stage + matchday.
  - `predictions_lock_mode` = `auto`.
  - `test_mode` = `false`.

### 3b. UCL próxima semana

- Llamada a `GET /v4/competitions/CL/matches?dateFrom=2026-05-04&dateTo=2026-05-10` (devuelve Arsenal–Atlético y Bayern–PSG, ambas SEMI_FINALS).
- Inserto igual que arriba pero con `stage = "UEFA Champions League - Semifinal"`, `prediction_window_id = NULL` (sin ventana específica → solo aplica el lock automático de 1h pre-kickoff).

> Nota: como `calc_points_match` busca `%semi%` en el stage para aplicar el x1.2, también va a aplicar a estos partidos UCL. Si no querés multiplicador en UCL, avisame y filtro por nombre de competición en el stage.

---

## 4. Detalles técnicos

### Edge function `bootstrap-admin` (one-shot)
- Crea el invite code y el usuario admin.
- Devuelve `{ ok: true, user_id }`.

### Edge function `import-fixtures` (one-shot)
- Inserta las 8 ventanas (idempotente, `ON CONFLICT DO NOTHING`).
- Trae los 104 partidos del Mundial + 2 UCL.
- Inserta vía `upsert` por `external_id` para que sea reejecutable.
- Devuelve resumen `{ wc_inserted, ucl_inserted, windows_inserted }`.

### Archivos a crear
- `supabase/functions/bootstrap-admin/index.ts`
- `supabase/functions/import-fixtures/index.ts`

### Sin cambios de schema
- No hace falta migración: las tablas `prediction_windows`, `matches`, `admin_invite_codes` ya existen con todas las columnas necesarias.
- El usuario se crea vía API admin de Supabase (no migración).

---

## Pregunta abierta

**Multiplicador UCL semifinales**: como tu sistema actual aplica x1.2 a cualquier stage que contenga "semi", los partidos UCL de la próxima semana van a sumar x1.2. ¿Lo dejo así (consistente con la regla actual) o el multiplicador solo debería aplicar al Mundial?

Si querés que solo aplique al Mundial, lo más limpio es actualizar `calc_points_match` para que también valide que el stage sea "World Cup" (puedo hacerlo en una mini-migración). Decime qué preferís y lo incluyo al ejecutar.
