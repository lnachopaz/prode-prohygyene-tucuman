import { format as fnsFormat } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
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

/**
 * Convierte el valor de un <input type="datetime-local"> (que el navegador
 * interpreta en su huso local) a un Date UTC, asumiendo que el admin tipeó
 * hora de Argentina. Útil para que crear/editar partidos siempre quede en AR
 * sin importar dónde esté el admin.
 */
export function arLocalInputToUTC(value: string): Date {
  return fromZonedTime(value, APP_TZ);
}

/**
 * Convierte un ISO UTC al string que un <input type="datetime-local"> espera,
 * pero ya en hora de Argentina (`yyyy-MM-ddTHH:mm`).
 */
export function utcToARLocalInput(input: string | Date): string {
  return formatAR(input, "yyyy-MM-dd'T'HH:mm");
}
