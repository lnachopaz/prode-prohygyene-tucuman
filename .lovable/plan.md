## Resumen

Cuatro cambios coordinados: (1) sincronización proactiva con Football-Data en momentos clave para marcar EN JUEGO y FINALIZADO, (2) marco rojo correcto cuando arranca el partido, (3) sacar el aviso global de "90 min" de la pestaña Pronósticos (solo queda en el Reglamento), y (4) mostrar el botón "Ver pronósticos de los demás" únicamente para partidos que ya empezaron o terminaron — nunca durante la hora previa al kickoff.

---

## 1) Sync con Football-Data: live + finalize en momentos clave

Hoy `sync-live-matches` solo finaliza partidos y nunca marca `live`, por eso la tarjeta nunca se pone roja. Cambios:

### a) Reescritura de `supabase/functions/sync-live-matches/index.ts`

El edge function hace **un solo trabajo**: para cada partido `test_mode=false` con `external_id` cuyo `kickoff_at` esté dentro de **alguna ventana de chequeo**, consulta el upstream y aplica:

- Si upstream `IN_PLAY` o `PAUSED` (medio tiempo) → `status='live'` (si todavía no lo está). Sin tocar `score_a/score_b` (la UI los oculta igual).
- Si upstream `FINISHED` o `AWARDED` → extrae `score.regularTime` (mismo criterio actual) y marca `status='finished'`.
- Si upstream `SCHEDULED/TIMED` y ya pasó el kickoff hace ≥ 5 min → no hace nada (esperamos al próximo tick).

Ventanas de chequeo por partido (en minutos relativos al kickoff):
```
-5, 0, +5    → para detectar arranque (live)
+115, +120, +125 → para detectar final
```
Cada tick acepta ±2 min de tolerancia (porque el cron corre cada 1 min, no en el minuto exacto).

Selección SQL en cada corrida:
```sql
select id, external_id, team_a, team_b, status, kickoff_at
from matches
where test_mode = false
  and external_id is not null
  and status <> 'finished'
  and (
        kickoff_at between now() - interval '7 min'  and now() + interval '7 min'   -- ventanas -5, 0, +5
     or kickoff_at between now() - interval '127 min' and now() - interval '113 min' -- ventanas +115, +120, +125
  )
```

Mantiene rate limiting (espera 6.5s entre llamadas), doble pase para finalize, y registra todo en `sync_logs`.

### b) Cron pg_cron cada 1 minuto

Insertar (no migración, porque incluye `apikey`) un cron que llama al edge cada minuto. La función se autoprotege con la query del punto anterior: la mayoría de las veces no hay candidatos y retorna en < 100ms sin gastar cuota de la API.

```sql
select cron.schedule(
  'sync-matches-live-finalize',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://bmbxkuiqyqbaviqeauzc.supabase.co/functions/v1/sync-live-matches',
       headers := '{"Content-Type":"application/json","apikey":"<ANON>"}'::jsonb
     ); $$
);
```

(Si ya existe un cron viejo apuntando al mismo endpoint, se hace `cron.unschedule` antes.)

### c) Frontend `useLiveMatches`

Para que el marco rojo aparezca rápido cuando el cron marca `live`, bajar el refetch de **5 min → 60 s** durante la ventana de partidos en curso. Implementación simple: dejar `refetchInterval: 60_000` siempre (la query es liviana y trae todos los partidos en una sola llamada, ya cacheada por React Query).

### d) Botón manual queda como fallback

En Admin > Sync, dejamos un botón "Sincronizar ahora" que invoca el mismo edge function por si el cron falla.

---

## 2) Marco rojo cuando el partido inicia

No hay cambio de código en `Predictions.tsx` (la lógica `derivedState === "EN_JUEGO"` ya pinta el marco rojo). El bug actual es que **nunca se setea `status='live'`** porque el sync solo finaliza. Con el cambio del punto 1, las tarjetas se ponen rojas automáticamente entre los minutos −5 y +5 del kickoff.

---

## 3) Quitar el aviso de "90 min" de Pronósticos

Eliminar el bloque `<div class="rounded-lg border border-primary/30 bg-primary/5 ...">` (líneas 206-212 de `src/pages/Predictions.tsx`) que dice *"Los resultados oficiales (90 min) y el cálculo de puntos se cargarán y mostrarán únicamente al finalizar cada partido"*.

Verificar que el Reglamento (`src/components/TournamentRules.tsx`) ya menciona la regla de los 90' (sí, en la sección "Eliminación directa": *"Se toma el resultado de los 90 minutos reglamentarios"*). Reforzar ese párrafo agregando explícitamente que **los puntos y el resultado oficial se publican únicamente cuando el partido termina**.

---

## 4) Ocultar "Ver pronósticos de los demás" antes del kickoff

Hoy la tarjeta muestra el botón en cualquier estado distinto de ABIERTO, lo que incluye CERRADO durante la hora previa al partido. Cambio en `src/pages/Predictions.tsx`:

```tsx
// Antes:
{derivedState !== "ABIERTO" && (<MatchDetailsDialog ... />)}

// Después: solo cuando ya empezó o terminó
{(derivedState === "EN_JUEGO" || derivedState === "FINALIZADO") && (
  <MatchDetailsDialog ... />
)}
```

Los partidos en CERRADO (1 h antes del kickoff y antes de que el sync los marque `live`) no muestran el botón. El usuario ve solamente su propio pronóstico bloqueado, y el botón aparece automáticamente cuando el partido pasa a EN_JUEGO o FINALIZADO.

---

## Detalle técnico (resumen)

```text
Archivos a modificar:
  supabase/functions/sync-live-matches/index.ts   (live + finalize, ventanas -5/0/+5 y +115/+120/+125)
  src/pages/Predictions.tsx                        (quitar banner 90', cambiar condición del botón "Ver pronósticos")
  src/components/TournamentRules.tsx               (reforzar nota sobre publicación de resultado/puntos)
  src/hooks/useLiveMatches.ts                      (refetch 60s en lugar de 5min)

SQL (vía supabase--insert, NO migración, porque incluye apikey):
  - cron.unschedule de cualquier job previo apuntando al endpoint.
  - cron.schedule 'sync-matches-live-finalize' cada 1 minuto.

Sin cambios:
  - Esquema de tablas.
  - Funciones de scoring.
  - Política RLS.
```

## Cuota API estimada

Plan free Football-Data = 10 req/min, 100 req/día. Con esta política, por **cada** partido se gastan máximo 6 requests (3 para detectar live + 3 para finalize). En un día con 4 partidos UCL = 24 requests. Holgado.
