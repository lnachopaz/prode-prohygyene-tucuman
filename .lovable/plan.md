## Objetivo

Garantizar que cuando un partido arranca pase a **EN JUEGO** (recuadro rojo) y que al terminar se cargue automáticamente el marcador de los 90′. Hoy esto no funciona porque el edge function deployado quedó desactualizado.

---

## Diagnóstico

1. El cron `sync-matches-live-finalize` corre cada 1 min ✅
2. El archivo `supabase/functions/sync-live-matches/index.ts` ya tiene la lógica nueva (ventanas −7/+7 min para live y −127/−113 min para finalize) ✅
3. **Pero el deploy quedó en el código viejo**: la última respuesta es *"No hay partidos pendientes de finalizar"* y los logs muestran *"no matches in finalize window"* — frases que ya no existen en el código actual. Esto explica por qué nunca se marca `status='live'` y el recuadro rojo nunca aparece.
4. El único partido real próximo es **Levante vs Osasuna** mañana viernes 16:00 hs ARG (~29 h). No alcanza con esperar: hay que validar la mecánica antes.

---

## Plan

### 1) Forzar redeploy del edge function

Tocar `supabase/functions/sync-live-matches/index.ts` (agregar versión en un comentario, sin cambiar la lógica) para que el sistema lo redeploye. Verificar con un POST manual que la respuesta nueva sea `{"updated":0, "message":"Sin partidos en ventana."}` (texto del código nuevo).

### 2) Verificar live-detection con Levante (sin tocar la base de datos del usuario)

Test temporal y reversible:

```text
a. Anotar kickoff_at original de Levante vs Osasuna  → 2026-05-08T19:00:00Z
b. UPDATE matches SET kickoff_at = now() - interval '1 minute'
   WHERE external_id = 'fd-544554'
c. Esperar al próximo tick del cron (≤60 s) o disparar el botón
   "Sync partidos" en Admin.
d. Verificar:
     - status = 'live' en la tabla matches
     - en /predictions, la tarjeta tiene marco rojo + badge "EN JUEGO"
     - sync_logs muestra action='marked-live'
e. Si Football-Data devuelve SCHEDULED (porque en la realidad el partido
   todavía no empezó), nuestro código no lo marca live. En ese caso usar
   la opción B (más abajo).
f. Restaurar: UPDATE matches SET kickoff_at = '2026-05-08T19:00:00Z',
   status = 'scheduled' WHERE external_id = 'fd-544554'.
```

**Opción B (si el upstream no coopera con la simulación)**: marcar manualmente `status='live'` desde el botón Admin existente y validar visualmente que el frontend muestra el recuadro rojo, badge "EN JUEGO" y oculta el marcador real (verifica solo la UI, no la sincronización).

### 3) Verificar finalize-detection con Levante

```text
a. UPDATE matches SET kickoff_at = now() - interval '120 minutes',
   status = 'live' WHERE external_id = 'fd-544554'
b. Disparar "Sync partidos".
c. Si Football-Data devuelve FINISHED para ese partido, nuestro código
   debería:
     - extraer score.regularTime
     - actualizar matches: status='finished', score_a, score_b
     - el trigger recalc_predictions_for_match recalcula puntos
d. Si el upstream sigue SCHEDULED (porque en la vida real no se jugó),
   no podemos validar la finalización contra la API real con este
   partido. En ese caso ver Opción C.
e. Restaurar el kickoff y status originales.
```

**Opción C (validar finalize sin depender del upstream)**: agregar un test temporal con un partido ya jugado de fecha pasada (ej. una jornada de La Liga ya terminada) creado en modo `test_mode=false` y con `external_id` real. Simular ventana finalize moviendo `kickoff_at` a `now() − 120 min` y comprobar que el sync trae el score real. Borrarlo al terminar el test.

### 4) Quick win adicional: log más explícito

Mientras tocamos el edge function para redeploy, agregar un `console.log` con cantidad de candidatos y acción tomada por cada uno, para que la próxima vez el debug sea instantáneo desde edge-function-logs (hoy solo se ve "booted/shutdown").

---

## Detalle técnico

```text
Archivos a tocar:
  supabase/functions/sync-live-matches/index.ts
    - bump de versión en comentario header (forza redeploy)
    - logs adicionales (console.log con candidatos y resultados)

SQL temporal (vía supabase--insert, no migración):
  - UPDATE de kickoff_at en Levante para simular ventanas live y finalize.
  - Restauración al kickoff original.

Sin cambios en:
  - Esquema de la base de datos.
  - Lógica de scoring.
  - Componentes de UI (la lógica del recuadro rojo y la badge "EN JUEGO"
    ya están bien — el bug es 100% del backend / deploy).
```

## Criterio de éxito

- POST a `/sync-live-matches` responde con el mensaje del código nuevo.
- Al simular kickoff hace 1 min, el partido pasa a `status='live'` en ≤60 s y la tarjeta de pronósticos muestra recuadro rojo + badge "EN JUEGO" + esconde el marcador real.
- Al simular kickoff hace 120 min, el partido pasa a `status='finished'` con `score_a` y `score_b` extraídos de `score.regularTime`, y los puntos se recalculan automáticamente.
