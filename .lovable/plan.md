# Corregir horarios y datos del fixture Mundial 2026

## Diagnóstico

Comparé los datos que enviaste con la base de datos: **los registros están bien** (mismos equipos, fechas, grupos y horarios). Por ejemplo México-Sudáfrica está cargado el 11/jun a las 21:00 UTC, que equivale a las **19:00 hora local de Ciudad de México** ✓.

El problema real es de **visualización**: la app muestra `kickoff_at` con `date-fns format()` usando la zona horaria del navegador del usuario. Si vos estás en Argentina (UTC-3), un partido a 21:00 UTC se ve como **18:00 del 11/jun** en lugar de las **19:00 hora local del estadio** que figuran en la lista oficial de FIFA.

Como el campeonato se juega en sedes de **6 zonas horarias distintas** (CDMX, Toronto, Vancouver, Este USA, Centro USA, Pacífico USA), la solución correcta es mostrar siempre la **hora local del estadio** y aclarar la sede.

## Plan

### 1. Guardar la sede de cada partido

- Migración: agregar columna `venue text` y `venue_tz text` a `matches`.
- Cargar los 104 partidos desde la lista oficial que enviaste, mapeando estadio → zona horaria:
  - `Estadio Ciudad de México`, `Guadalajara`, `Monterrey` → `America/Mexico_City`
  - `Estadio de Toronto` → `America/Toronto`
  - `BC Place Vancouver` → `America/Vancouver`
  - `Boston`, `Filadelfia`, `Nueva York/Nueva Jersey`, `Miami`, `Atlanta` → `America/New_York`
  - `Dallas`, `Houston`, `Kansas City` → `America/Chicago`
  - `Los Angeles`, `Bahía de San Francisco`, `Seattle` → `America/Los_Angeles`

### 2. Recargar la tabla `matches` desde cero

- `DELETE FROM matches;` y reinsertar los 104 partidos exactamente como aparecen en tu lista (incluyendo sede y zona horaria).
- Para cada partido, calcular `kickoff_at` (UTC) a partir de fecha local + hora local + tz del estadio. Los horarios locales que mostrará la app van a coincidir 1:1 con los que pegaste.
- Las eliminatorias (W73 vs W75, 1A vs 3CEFHI, etc.) se cargan con esos placeholders como `team_a`/`team_b` hasta que se conozcan los clasificados.

### 3. Mostrar siempre hora local del estadio

- Usar `date-fns-tz` (`formatInTimeZone`) en `Predictions.tsx`, `Live.tsx`, `Dashboard.tsx` para renderizar `kickoff_at` en la `venue_tz` del partido.
- Mostrar la sede debajo del horario (ej. "19:00 · Estadio Ciudad de México") para que quede claro a qué hora local corresponde.
- El componente `Countdown` sigue funcionando con el instante UTC real, sin cambios.

### 4. Limpieza

- Borrar `src/data/worldCup2026Fixture.ts` y la edge function `sync-matches` (ya está deshabilitada y no se va a usar más).

## Aviso

Al borrar `matches` se eliminan los pronósticos asociados. Hoy no hay pronósticos cargados de usuarios reales (verificado: el único usuario tiene 0), así que no se pierde nada.

## Resultado esperado

- 104 partidos exactos a tu lista, sin duplicados.
- Cada partido muestra la hora local del estadio (ej. "19:00") sin importar desde qué país abras la app, igual a fifa.com.
- Aparece la sede al lado del horario para evitar confusión.
