# Plan: Reemplazar "Live" por "En juego"

## Objetivo
Sacar la pestaña Live (lenta, problemática) y reemplazarla por una pestaña "En juego" liviana que:
- Muestra el próximo partido con countdown.
- Lista los partidos en curso (sin marcador en vivo, ya que la API se actualiza al final).
- Una vez cerrados los pronósticos (1h antes), muestra la tabla de qué pronosticó cada usuario.
- Aclara visiblemente que **los resultados se mostrarán al finalizar el partido**.
- Al finalizar el partido, el edge function `sync-live-matches` actualiza el marcador y se recalculan los puntos automáticamente (ya implementado vía trigger).

## Cambios

### 1. Navegación (`src/components/AppLayout.tsx`)
- Renombrar el item "Live" → **"En juego"** en nav desktop y mobile.
- Mantener el icono `Radio` (o cambiar a `Swords` para reflejar mejor "en juego").
- La ruta `/live` se mantiene por compatibilidad de enlaces internos.

### 2. Página "En juego" (`src/pages/Live.tsx` — reescritura simplificada)
Reemplazar la página actual con una versión más liviana:
- **Sin auto-sync agresivo cada 30s** ni invocación manual del edge function. Solo lectura desde Supabase con `useLiveMatches` (smart polling existente: 1 min si hay live, 5 min si no).
- **Sin cálculo de marcadores parciales**: la API solo actualiza al finalizar.
- Layout:
  - Título: **"En juego"**.
  - Aviso destacado (banner/Alert): *"Los marcadores se actualizan al finalizar cada partido. Mientras tanto, podés ver los pronósticos del grupo una vez cerrada la ventana (1 hora antes del inicio)."*
  - **Próximo partido**: card con equipos, banderas, kickoff y `<Countdown />`.
  - **Partidos en curso** (status `live` o ya iniciados sin finalizar): card simple sin marcador, indicando "En juego — resultado al finalizar".
  - **Pronósticos del grupo**: para el partido seleccionado (próximo o en curso), si los pronósticos están cerrados (kickoff − 1h ya pasó), mostrar la tabla con `display_name` + `pred_a-pred_b`. Sin badges de puntos parciales.
  - Si el partido está finalizado, mostrar marcador final + badges de puntos (3/1/0).

### 3. Dashboard (`src/pages/Dashboard.tsx`)
- En la card del próximo partido, cuando `isLive`:
  - Cambiar texto "En vivo ahora" → **"En juego"**.
  - Quitar la línea de marcador (`{score_a} - {score_b}`) y reemplazar por texto: *"Resultado al finalizar"*.
  - Botón "Ver en vivo" → **"Ver en juego"** (sigue apuntando a `/live`).

### 4. Sincronización al finalizar (sin cambios de código)
El edge function `sync-live-matches` ya:
- Sincroniza partidos en estado `live` y `scheduled` próximos / pasados hasta 4h.
- Actualiza `score_a`, `score_b`, `status` → `finished` cuando la API lo reporta.
- El trigger DB `recalc_predictions_for_match` ya recalcula puntos automáticamente.
- El cron existente (si está) sigue corriendo. **Verificación recomendada**: confirmar que hay un cron periódico invocando `sync-live-matches` cada N minutos para que los partidos finalicen sin intervención. Si no existe, agregarlo (cron cada 5 min).

## Detalles técnicos

- Mantener la ruta `/live` para no romper enlaces existentes (Dashboard linkea ahí).
- `useLiveMatches` se sigue usando: ya hace smart polling sin spam.
- Quitar imports no usados tras la simplificación: `Loader2` solo si hace falta, `RefreshCw`, `useEffect` del auto-sync, `toast`, `subHours` (la lógica de "predsLocked" puede usar comparación simple `kickoff − 1h <= now`).
- Mantener query `live-predictions` para tabla de pronósticos del grupo, pero sin `points` parciales en la UI (solo cuando `status === 'finished'`).

## Pregunta abierta (opcional, podemos resolver al implementar)
- ¿Confirmar si querés que también renombre el icono (de `Radio` a `Swords` / `Activity`) o lo dejo como está?
