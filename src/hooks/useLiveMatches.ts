import { useQuery } from "@tanstack/react-query";
import { fetchMatches, type Match } from "@/lib/matchesService";

/**
 * Polling moderado: ya NO hay sync minuto a minuto ni resultados en vivo.
 * Los resultados solo aparecen cuando un partido se marca como `finished`,
 * por lo tanto basta con refrescar cada 5 minutos y al volver a la pestaña.
 */
export const REFETCH_INTERVAL_MS = 300_000;
export const MATCHES_STALE_TIME_MS = 60_000;

export function useLiveMatches() {
  return useQuery<Match[]>({
    queryKey: ["matches", "live-feed"],
    queryFn: fetchMatches,
    staleTime: MATCHES_STALE_TIME_MS,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}
