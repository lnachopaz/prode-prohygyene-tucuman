import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";

const FALLBACK_TZ = "America/Mexico_City";

/** Format the kickoff in the venue's local timezone, e.g. "19:00". */
export function formatLocalTime(iso: string, tz: string | null | undefined, pattern = "HH:mm") {
  return formatInTimeZone(iso, tz || FALLBACK_TZ, pattern, { locale: es });
}

/** Returns the YYYY-MM-DD date in the venue's tz (used for grouping by matchday). */
export function localDateKey(iso: string, tz: string | null | undefined) {
  return formatInTimeZone(iso, tz || FALLBACK_TZ, "yyyy-MM-dd");
}

/** Pretty date heading for a matchday key (uses Spanish locale). */
export function formatLocalDateHeading(iso: string, tz: string | null | undefined) {
  return formatInTimeZone(iso, tz || FALLBACK_TZ, "EEEE d 'de' MMMM yyyy", { locale: es });
}
