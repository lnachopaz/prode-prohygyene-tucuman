import { format as fnsFormat } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";

/**
 * Zona horaria oficial del prode. Toda la UI muestra horarios de Argentina.
 */
export const APP_TZ = "America/Argentina/Buenos_Aires";

/**
 * Formatea una fecha (ISO string o Date) a hora de Argentina.
 * Acepta el mismo string de formato que date-fns.
 */
export function formatAR(input: string | Date, pattern: string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const zoned = toZonedTime(date, APP_TZ);
  return fnsFormat(zoned, pattern, { locale: es });
}
