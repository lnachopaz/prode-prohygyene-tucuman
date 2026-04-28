# Goles y tarjetas en vivo

Hoy el Live ya trae **marcador y estado** desde Football-Data.org, pero no muestra los **eventos del partido** (quién metió el gol, en qué minuto, tarjetas amarillas/rojas). Vamos a sumarlo.

## Qué vas a ver en Live

Debajo del marcador, una **timeline cronológica** del partido:

```text
 90' 🟨 Casemiro (MUN)
 78' ⚽ Mbeumo (BRE)        2 - 1
 65' 🟥 Højlund (MUN)
 42' ⚽ Rashford (MUN)      2 - 0
 18' ⚽ Fernandes (MUN)     1 - 0
```

- ⚽ Goles con jugador, minuto y marcador resultante
- 🟨 Amarillas / 🟥 Rojas con jugador y minuto
- Se actualiza junto al marcador (cada 30s mientras estás mirando)
- Si el partido todavía no arrancó: no se muestra la sección
- Si arrancó pero no hay eventos: "Sin eventos todavía"

## Cómo se va a hacer (técnico)

### 1. Nueva tabla `match_events`

Guarda los eventos para no depender de la API en cada refresh y poder mostrar histórico.

```text
match_events
├─ id (uuid)
├─ match_id (uuid → matches.id)
├─ minute (int)              -- minuto del partido
├─ type (text)               -- 'goal' | 'yellow_card' | 'red_card' | 'substitution'
├─ team (text)               -- 'home' | 'away'
├─ player (text)             -- nombre del jugador
├─ score_home (int, null)    -- marcador después del evento (solo goles)
├─ score_away (int, null)
├─ external_id (text unique) -- id del evento en Football-Data, evita duplicados
└─ created_at
```

- RLS: SELECT abierto a usuarios aprobados, INSERT/UPDATE solo service_role (la edge function).
- Índice en `(match_id, minute)`.

### 2. Edge Function `sync-live-matches` (extender la existente)

Football-Data v4 devuelve en `/matches/{id}` los arrays:
- `goals[]` → `{ minute, scorer.name, team.name, score.home, score.away }`
- `bookings[]` → `{ minute, player.name, card: 'YELLOW' | 'RED', team.name }`

La función va a:
1. Traer el partido como ya hace.
2. Mapear `goals` y `bookings` a filas de `match_events` con `external_id` único (ej: `fd-538122-goal-42-Rashford`).
3. Hacer `upsert` con `onConflict: 'external_id'` → idempotente, no duplica.
4. Devolver el conteo de eventos sincronizados además de los marcadores.

### 3. Frontend: nuevo componente `MatchTimeline`

En `src/pages/Live.tsx`, debajo del marcador y antes de "Pronósticos del grupo":

- Query `match-events` filtrada por `matchId`, `refetchInterval: 30_000`.
- Render ordenado por `minute` descendente (lo más reciente arriba).
- Iconos: `Goal` de lucide para ⚽, `Square` amarillo/rojo para tarjetas.
- Solo se muestra si `started === true`.

### 4. Realtime (opcional pero copado)

Habilitar realtime sobre `match_events` para que los goles aparezcan **al instante** en todos los dispositivos abiertos, sin esperar al próximo polling de 30s:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_events;
```

Y en `Live.tsx` un `supabase.channel('match-events').on('postgres_changes', ...)` que invalide la query cuando llega un INSERT.

## Limitaciones honestas

- **Football-Data plan free** (10 req/min): el detalle de eventos solo viene en `/matches/{id}`, ya lo estamos pidiendo. Ok.
- **Latencia**: Football-Data suele tener los goles cargados ~30-90s después del evento real. No es ESPN, pero es lo mejor gratis.
- **Tarjetas**: a veces vienen unos minutos tarde o sin nombre del jugador completo. Lo manejo con fallbacks.
- Solo funciona para partidos con `external_id` que empieza con `fd-` (los del Mundial, una vez los vinculemos).

## Pasos de implementación

1. Migración: crear tabla `match_events` + RLS + índice + agregar a `supabase_realtime`.
2. Actualizar edge function `sync-live-matches` para extraer y upsertear eventos.
3. Crear componente `MatchTimeline.tsx`.
4. Integrarlo en `Live.tsx` + suscripción realtime.
5. Probar con el partido de prueba (Manchester United vs Brentford si todavía está vinculado, o lo re-vinculamos a un partido en curso).
