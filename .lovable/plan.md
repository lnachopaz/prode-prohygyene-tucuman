
## Cambios solicitados

### 1. Sacar el banner de los 90 min de Pronósticos
- **`src/pages/Predictions.tsx`** (líneas 206-208): eliminar el `<div>` informativo "Los resultados oficiales (90 min)…".
- Mantenerlo en el reglamento (`TournamentRules.tsx`) — ya está cubierto en la sección "Eliminación directa".

### 2. Más información en la tarjeta de cada partido
En `MatchCard` de `Predictions.tsx`, mostrar consistentemente en **ambos layouts** (abierto y cerrado/en vivo/finalizado):
- Día completo (ej: "Mié 10/06") + hora ("21:00 hs AR").
- Estadio (`venue`) con ícono 📍.
- Etapa + grupo (ya está).
- En el layout "cerrado/en vivo/finalizado" hoy falta la fecha/hora explícita: agregar bloque tipo:
  ```
  📅 Mié 10/06 · 21:00 hs   📍 Estadio Azteca, CDMX
  ```

### 3. Multiplicador combinado visible
Cuando hay más de un multiplicador activo (ej: Argentina x2 + Cuartos x1.2), en el panel del partido mostrar el cálculo además del total:
- En el badge actual (amarillo `Sparkles`) seguimos mostrando el total (`x2.4`).
- Debajo, si `reasons.length > 1`, agregar una línea pequeña tipo `x2 (Argentina) × x1.2 (Cuartos) = x2.4`.
- Ya está `getMultiplierInfo` con `reasons` y `mult`; sólo se compone el string en JSX. No se toca el cálculo de puntos.

### 4. Que no se "refresque la página" al cambiar de pestaña
Causa probable: `refetchOnWindowFocus` por defecto + `refetchInterval` (Dashboard 30 s, sync logs 5 s). Cuando el usuario vuelve a la pestaña del navegador o cambia de tab interno, React Query refetchea y se ven loaders.
- Configurar globalmente en el `QueryClient` (en `src/main.tsx` o donde se cree): `refetchOnWindowFocus: false`, `refetchOnReconnect: false`.
- Bajar `refetchInterval` del Dashboard a 60 s y mantener el del polling sólo para `useLiveMatches` (ya tiene smart polling).
- En `Admin > Sync logs` dejar 30 s en vez de 5 s.

### 5. Badge rojo "En Juego" no aparece al iniciar
Hoy depende de `match.status === "live"`, que sólo cambia cuando el sync corre y la API devuelve `IN_PLAY`. El sync corre cada X minutos por cron y puede tardar.
- **Frontend (cosmético, inmediato):** en la tarjeta, considerar "en juego" cuando `now >= kickoff` y `now <= kickoff + 115min` y `status !== 'finished'`. Pintar borde rojo + badge "🔴 En Juego" igual que hoy. Esto garantiza el rojo apenas comienza, sin esperar al sync.
- **Backend (real):** complementar con el punto 6 para que el `status` del DB también se actualice rápido.

### 6. Cron de sincronización más denso alrededor del partido
Reemplazar el cron actual de `sync-live-matches` por **disparos puntuales** relativos al kickoff de cada partido, garantizando llamadas en T-5, T+0, T+5, T+115, T+120 y T+125 minutos.

Implementación práctica con `pg_cron` (no se puede agendar por partido sin job dinámico): correr `sync-live-matches` **cada 5 minutos** y dentro del edge function filtrar partidos donde `now` cae en alguna de las ventanas:
- `[kickoff-7min, kickoff-3min]` → marca pronto
- `[kickoff-2min, kickoff+7min]` → arranque (pone `live`)
- `[kickoff+113min, kickoff+127min]` → cierre (pone `finished` con `fullTime`)

Y mantener `finalize-finished-matches` cada 15 min como red de seguridad.

Cambios concretos:
- **`supabase/functions/sync-live-matches/index.ts`:** ajustar el SELECT de candidatos a esas tres ventanas en vez de "30 min antes / 4 h después".
- **DB (cron):** actualizar el schedule del job `sync-live-matches` a `*/5 * * * *` vía `supabase--insert` (no es schema, son datos en `cron.job`).
- **Manual override (ya existe):** seguir respetando `status='finished'` y `test_mode=true` para no pisar correcciones.

### 7. "Ver detalles" sólo si la carga ya cerró por tiempo o el partido terminó
Hoy el botón aparece cuando `match.status === "finished" || isClosedScheduled || isLive`. Pero `isClosedScheduled` también es true si el admin lo cerró manualmente con `force_closed` antes de tiempo, o si la ventana de carga aún no abrió/cerró por reglas distintas al tiempo.

Regla pedida: mostrar "Ver detalles" sólo si:
- `match.status === "finished"`, **o**
- el cierre fue **por tiempo** (`now >= kickoff - 1h`) o por **ventana de fecha vencida** (`now > predWindow.closes_at`).

No mostrarlo si el cierre es sólo por `force_closed` (admin) o por ventana que aún no abrió.

Actualizar la condición del render del `<MatchDetailsDialog>` y reemplazar `isClosedScheduled || isLive` por la nueva regla `closedByTime`.

---

## Resumen de archivos a tocar

- `src/pages/Predictions.tsx` — quitar banner, info ampliada, multiplicador combinado, regla de "Ver detalles", borde rojo "en juego" por tiempo.
- `src/main.tsx` (o donde se instancia `QueryClient`) — defaults `refetchOnWindowFocus: false`.
- `src/pages/Dashboard.tsx` — bajar `refetchInterval` a 60 s.
- `src/pages/Admin.tsx` — bajar `refetchInterval` de sync logs a 30 s.
- `supabase/functions/sync-live-matches/index.ts` — nuevas ventanas de candidatos (T-5, T+0..+5, T+115..+125).
- `cron.job` (vía `supabase--insert`) — schedule cada 5 min.

## Pregunta antes de implementar

Ninguna; las decisiones quedaron claras en tu mensaje. Si querés que el cron quede cada 5 min "siempre" o sólo durante días con partidos, decime y lo afino.
