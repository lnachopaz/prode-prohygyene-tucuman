import { supabase } from "@/integrations/supabase/client";

const PAGE = 1000;

/**
 * Fetch ALL rows from a table/select, paginating in chunks of 1000 to bypass
 * the PostgREST default limit. Pass a builder factory so we can re-issue the
 * same select per page with a different .range().
 */
export async function fetchAllPaginated<T>(
  build: () => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // safety cap: 100k rows
  for (let i = 0; i < 100; i++) {
    const to = from + PAGE - 1;
    const { data, error } = await build().range(from, to);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export { supabase };
