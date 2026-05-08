import { useQuery } from "@tanstack/react-query";
import { fetchMatches, hasLiveMatch, type Match } from "@/lib/matchesService";

/** Intervalo cuando hay al menos un partido en vivo (status = 'live'). */
export const LIVE_INTERVAL_MS = 60_000;
/** Intervalo cuando no hay partidos en vivo. */
export const IDLE_INTERVAL_MS = 300_000;
/** Tiempo durante el cual los datos se consideran frescos (no se refetchean). */
export const MATCHES_STALE_TIME_MS = 30_000;

/**
 * Hook con smart polling para la lista de partidos.
 *
 * - `staleTime` = 30s: si el usuario navega entre tabs, no dispara fetches
 *   innecesarios mientras los datos sean recientes.
 * - `refetchInterval` dinámico: 1 min si hay partidos en vivo, 5 min si no.
 * - Sin refetch en focus para no romper la cadencia del polling.
 */
export function useLiveMatches() {
  return useQuery<Match[]>({
    queryKey: ["matches", "live-feed"],
    queryFn: fetchMatches,
    staleTime: MATCHES_STALE_TIME_MS,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      hasLiveMatch(query.state.data as Match[] | undefined)
        ? LIVE_INTERVAL_MS
        : IDLE_INTERVAL_MS,
  });
}
