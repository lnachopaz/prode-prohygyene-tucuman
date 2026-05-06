## Resumen

Refactor profundo en 5 ejes: estados de partido + UI, sincronización solo al finalizar, multiplicadores combinados (equipo + partido) para el test de UCL, bots de prueba, y permisos absolutos de admin.

---

## 1) Estados del partido y UI (`src/pages/Predictions.tsx` + `MatchDetailsDialog.tsx`)

Se define un único `derivedState` por partido con cuatro valores:

- **ABIERTO**: `status='scheduled'` y aún no se llegó al `lockAt` (1h antes del kickoff o ventana).
- **CERRADO**: `status='scheduled'` pero ya se pasó el `lockAt` (o `force_closed`, o ventana cerrada). Inputs bloqueados, botón "Ver pronósticos de los demás".
- **EN JUEGO**: `status='live'`. Marco rojo (`border-2 border-destructive`), badge animado "EN JUEGO", inputs bloqueados, **el resultado real NO se muestra** (se oculta `score_a/score_b` aunque exista). Sí se muestra "Ver pronósticos de los demás".
- **FINALIZADO**: `status='finished'`. Se muestra resultado oficial (90'), puntos del usuario y `MatchDetailsDialog` con la tabla completa.

Cambios concretos:
- Quitar el bloque "Marcador en vivo" (líneas 480-488 de `Predictions.tsx`) — en EN JUEGO no se muestra score.
- En estado CERRADO, mostrar el componente `MatchDetailsDialog` (que ya lista pronósticos de todos) con un botón "Ver qué pronosticaron los demás". Adaptar `MatchDetailsDialog` para aceptar `hideRealScore` y ocultar columnas/sección de "Resultado real" / "Aciertos" cuando el partido aún no terminó.
- Banner global arriba de la página: *"Los resultados oficiales (90 min) y el cálculo de puntos se cargarán y mostrarán únicamente al finalizar cada partido."*

## 2) Sincronización: solo al finalizar (`supabase/functions/sync-live-matches/index.ts` + Admin.tsx)

- **Eliminar de la UI** todos los botones de "Sincronizar marcadores en vivo" y "Forzar sync ahora" (Admin.tsx líneas 80-84 y 546). Mantener la pestaña Sync solo como **logs de auditoría** + exports.
- **Reescribir el edge function `sync-live-matches`** y renombrarlo conceptualmente a flujo "finalize-only":
  - Ya no consulta partidos `status='live'` ni `scheduled+30min`.
  - Selecciona partidos con `external_id` cuyo `kickoff_at` esté entre `now() - 4h` y `now() - 100min` (ya pasaron los 90' + descuento + posibles alargues), `status != 'finished'` y `test_mode=false`.
  - Por cada uno consulta Football-Data; si el upstream `status === 'FINISHED'`, extrae **estrictamente** `score.regularTime.home / regularTime.away` (ignorando `extraTime` y `penalties`). Si `regularTime` no viene, usa `fullTime` solo si `match.score.duration === 'REGULAR'`. Si fue a alargue, sigue tomando `regularTime`.
  - Marca `status='finished'` y guarda los goles.
  - Doble pase de seguridad: cada partido elegible se chequea, si la primera llamada no lo encuentra finalizado, se reintenta una segunda vez en la misma corrida tras 8s (la app no usa webhooks ni minuto a minuto).
- **Cron**: sustituir cualquier polling agresivo por un cron `pg_cron` cada 15 minutos que invoque solo el finalize. (Si no existe, dejarlo documentado en una migración opcional.)
- En frontend, `useLiveMatches` deja de hacer smart polling de 60s; pasa a un único refetch cada 5 min y on focus, ya que no hay actualizaciones en vivo.

## 3) Bots y multiplicadores UCL (script + migración)

**Bots (10 cuentas)**:
- Crear edge function `seed-test-bots` (admin-only, valida JWT + `has_role admin`) que:
  1. Crea 10 usuarios `bot01..bot10@prode.test` con `Prode2026!` vía `auth.admin.createUser`, `display_name="🤖 Bot 0X"`, status `approved`.
  2. Inserta 10 pronósticos distintos para el partido **Bayern vs PSG (id `dae6d78e-...`)** del 2026-05-06.
- Botón "Crear 10 bots para UCL mañana" en la pestaña Modo Prueba.

**Multiplicadores combinados**:
El usuario pide: Bayern x2 (porque el equipo es Bayern) + partido x1.2 (multiplicador del partido). El esquema actual `multiplier_override` solo tiene un número y ya está en 2. Necesitamos dos campos.

- **Migración SQL**: agregar columna `team_multiplier_override jsonb` a `matches` con forma `{"team":"FC Bayern München","mult":2}` (o `null`). Mantener `multiplier_override` como multiplicador del partido entero.
- Para el partido Bayern vs PSG (id `dae6d78e-...`) setear: `multiplier_override = 1.2`, `team_multiplier_override = {"team":"FC Bayern München","mult":2}`.
- Actualizar `calc_points_match` y `calc_points_full` para multiplicar por **ambos** (excluyendo en UCL la lógica genérica de fase, como ya hace hoy). Resultado para Bayern: `base × 2 (equipo) × 1.2 (partido) = base × 2.4`. Para PSG: `base × 1.2`.
- Reflejar lo mismo en `src/lib/scoring.ts` (`getMatchMultiplier` / `getMultiplierInfo`) para que el badge en la tarjeta muestre `x2.4` con tooltip "Bayern x2 + Especial partido x1.2".
- Para el resto de los partidos no cambia nada (no tienen `team_multiplier_override` y `multiplier_override` queda null/none).

**Formato de puntos**: `formatPoints` ya hace exactamente lo pedido (entero → "5", decimal → "5,2"). Verificar que se use en todas partes (Ranking, Dashboard, Profile, MatchDetailsDialog, Predictions). Auditar y reemplazar cualquier `toFixed(2)` o `Number(p.points)` crudo restante.

## 4) Permisos de Administrador — Poder Absoluto (`Admin.tsx` + RLS + RPC)

Hoy faltan dos cosas:

- **Borrar/bloquear admins**: en `UserRow` (líneas 419-450) los botones "Eliminar" y "Bloquear" se ocultan si `user.is_admin`. Quitar esa restricción. Mantener solo la guardia de seguridad ya implementada en `delete_user_completely` ("no podés eliminarte a vos mismo"). Confirmar con `AlertDialog` doble cuando el target es admin.
- **Bloquear admin**: usar `set_user_status(user_id, 'rejected')` también para admins.
- **Modificar pronósticos en cualquier estado**: `EditablePredRow` ya existe y respeta el flujo correcto. Verificar que la policy `predictions_admin_all` permite `UPDATE` (sí lo hace). Permitir también borrado individual con un botón Trash + confirmación.
- **Modificar resultados manualmente**: `MatchAdminRow` ya lo permite. No requiere cambios.

## 5) Banner informativo en Pronósticos

Insertar al tope de `Predictions.tsx`, debajo del título, un `Alert` (variante `default` con `Info` icon):

> "Los resultados oficiales (90 min) y el cálculo de puntos se cargarán y mostrarán únicamente al finalizar cada partido."

---

## Detalle técnico (resumen para implementación)

```text
Archivos a modificar:
  src/pages/Predictions.tsx          (estados, banner, ocultar score en live, "ver detalles" en cerrado)
  src/components/MatchDetailsDialog.tsx (prop hideRealScore + botón configurable)
  src/pages/Admin.tsx                (quitar botones sync, permitir borrar/bloquear admins, botón bots)
  src/lib/scoring.ts                 (combinar team + match override)
  src/hooks/useLiveMatches.ts        (sin polling agresivo)
  supabase/functions/sync-live-matches/index.ts  (finalize-only + regularTime estricto + doble pase)

Archivos a crear:
  supabase/functions/seed-test-bots/index.ts     (10 bots + 10 predicciones UCL)

Migraciones SQL:
  - ALTER TABLE matches ADD COLUMN team_multiplier_override jsonb;
  - CREATE OR REPLACE FUNCTION calc_points_match(...) — incluir team_multiplier_override;
  - CREATE OR REPLACE FUNCTION calc_points_full(...) — pasar team_multiplier_override;
  - UPDATE trigger recalc_predictions_for_match para disparar también si cambia team_multiplier_override.
  - (data) UPDATE matches SET multiplier_override=1.2, team_multiplier_override='{"team":"FC Bayern München","mult":2}' WHERE id='dae6d78e-7ff7-4281-a307-b8230e486bc4';
```

## Pregunta abierta

El partido **Arsenal vs Atlético** (5 may, ya finalizado, con `multiplier_override=1.2`) lo dejo tal cual (tu pedido anterior). ¿Confirmás?
