/**
 * Formatea puntos: si es entero muestra "3", si tiene decimales "3,6" (coma decimal AR).
 */
export function formatPoints(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "0";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0$/, "").replace(".", ",");
}
