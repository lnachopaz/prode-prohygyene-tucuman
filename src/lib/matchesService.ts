import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Match = Database["public"]["Tables"]["matches"]["Row"];

/**
 * Fetch all matches from Supabase.
 *
 * REGLA DE ORO: el frontend NUNCA llama APIs externas de deportes.
 * Toda la información se obtiene de la tabla `matches` en Supabase.
 * El sync con football-data ocurre exclusivamente en el edge function
 * `sync-live-matches` (servidor).
 */
export async function fetchMatches(): Promise<Match[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export const hasLiveMatch = (matches: Match[] | undefined): boolean =>
  !!matches?.some((m) => m.status === "live");
