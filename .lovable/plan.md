# Vista Live de partidos — arquitectura de alto rendimiento

## Objetivo

Garantizar que toda la información de partidos en la UI venga **exclusivamente** de Supabase (tabla `matches`), con polling inteligente y caché eficiente vía React Query.

## Estado actual

- ✅ El frontend ya consume Supabase únicamente. La única llamada a football-data está en el edge function `sync-live-matches` (servidor), lo cual respeta la regla de oro.
- ⚠️ `src/pages/Live.tsx` hace polling fijo de 30s, no diferencia entre "hay partido en vivo" o no.
- ⚠️ No hay `staleTime`, así que cambiar de pestaña refetchea aunque los datos sean frescos.
- ⚠️ La lógica de fetch está inline en el componente, no reutilizable.

## Aclaración sobre el esquema

La tabla real es `matches` con estas columnas (no las que mencionás en el prompt):

- `team_a`, `team_b` (no `home_team`/`away_team`)
- `score_a`, `score_b`
- `status` enum: `scheduled` | `live` | `finished` (equivalente a `TIMED`/`IN_PLAY`/`FINISHED`)
- `updated_at` (equivalente a `last_updated`)
- + `kickoff_at`, `stage`, banderas, etc.

Voy a respetar el esquema real y exponer un tipo `Match` claro en TS.

## Cambios

### 1. Nuevo servicio `src/lib/matchesService.ts`

Función única `fetchMatches()` que consulta Supabase:

- `select("*").order("kickoff_at")`
- Devuelve `Match[]` tipado.
- Helper `hasLiveMatch(matches)` para decidir el intervalo.

### 2. Nuevo hook `src/hooks/useLiveMatches.ts`

Encapsula la query con **smart polling**:

- `queryKey: ["matches", "live-feed"]`
- `staleTime: 30_000` → no refetch si los datos tienen menos de 30s (cubre navegación entre tabs).
- `refetchInterval`: función dinámica basada en los datos actuales:
  - Si algún match tiene `status === 'live'` → **60_000 ms**
  - Si no → **300_000 ms**
- `refetchOnWindowFocus: false` para no romper el smart polling.
- `gcTime: 5 * 60_000` para retener en caché tras desmontar.

### 3. Refactor de `src/pages/Live.tsx`

- Reemplazar el `useQuery` inline por `useLiveMatches()`.
- Mantener el resto de la UI (selector multi-partido, pronósticos del grupo, mi pronóstico, countdown).
- Las queries secundarias (`live-predictions`, `live-my-pred`) también pasan a `staleTime: 30_000` y un `refetchInterval` que sigue la misma lógica (60s si live, 5 min si no).

### 4. Sin cambios en `App.tsx`

El `QueryClient` global se mantiene; los defaults se setean por query para no afectar otras pantallas.

## Detalles técnicos

```ts
// src/lib/matchesService.ts
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Match = Database["public"]["Tables"]["matches"]["Row"];

export async function fetchMatches(): Promise<Match[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export const hasLiveMatch = (matches: Match[] | undefined) =>
  !!matches?.some((m) => m.status === "live");
```

```ts
// src/hooks/useLiveMatches.ts
import { useQuery } from "@tanstack/react-query";
import { fetchMatches, hasLiveMatch, type Match } from "@/lib/matchesService";

const LIVE_INTERVAL = 60_000;     // 1 min cuando hay partido en vivo
const IDLE_INTERVAL = 300_000;    // 5 min cuando no

export function useLiveMatches() {
  return useQuery<Match[]>({
    queryKey: ["matches", "live-feed"],
    queryFn: fetchMatches,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      hasLiveMatch(query.state.data) ? LIVE_INTERVAL : IDLE_INTERVAL,
  });
}
```

## Archivos afectados

- ➕ `src/lib/matchesService.ts`
- ➕ `src/hooks/useLiveMatches.ts`
- ✏️ `src/pages/Live.tsx` (refactor: usar el hook, ajustar `staleTime` en queries secundarias)

## Lo que NO se toca

- `App.tsx` y el `QueryClient` global.
- Otras páginas (`Dashboard`, `Predictions`, `Admin`, `Ranking`).
- Edge functions (siguen siendo el único punto que habla con football-data).
- Esquema de la base de datos.
