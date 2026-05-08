// Formatea nombres de grupos provenientes de la API (ej. "GROUP_A") a "Grupo A".
export function formatGroupName(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  // Patrones comunes: GROUP_A, group a, Group-A, A
  const m = s.match(/^(?:group|grupo)?[\s_\-]*([a-z0-9]+)$/i);
  if (m) return `Grupo ${m[1].toUpperCase()}`;
  return s;
}
