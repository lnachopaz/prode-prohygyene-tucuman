/**
 * Multiplicadores del Prode 2026:
 * - x2 si juega Argentina
 * - x3 en la final del Mundial
 * - x1.2 en octavos / cuartos / semis / 3° puesto
 * Se acumulan: una final con Argentina = x6.
 */

export function getMatchMultiplier(
  team_a: string | null | undefined,
  team_b: string | null | undefined,
  stage: string | null | undefined,
): number {
  let mult = 1;
  const ta = (team_a ?? "").toLowerCase();
  const tb = (team_b ?? "").toLowerCase();
  const s = (stage ?? "").toLowerCase();

  if (ta.includes("argentina") || tb.includes("argentina")) {
    mult *= 2;
  }

  const isFinal =
    s.includes("final") &&
    !s.includes("semi") &&
    !s.includes("tercer") &&
    !s.includes("third") &&
    !s.includes("1/2") &&
    !s.includes("cuarto") &&
    !s.includes("quarter") &&
    !s.includes("octavo");

  const isKnockout =
    !isFinal &&
    (s.includes("octavo") ||
      s.includes("round of 16") ||
      s.includes("last 16") ||
      s.includes("cuarto") ||
      s.includes("quarter") ||
      s.includes("semi") ||
      s.includes("tercer") ||
      s.includes("third") ||
      s.includes("1/2"));

  if (isFinal) mult *= 3;
  else if (isKnockout) mult *= 1.2;

  return mult;
}

export function formatMultiplier(mult: number): string {
  if (Number.isInteger(mult)) return `x${mult}`;
  // 1.2, 2.4, 3.6, 6 etc.
  return `x${mult.toFixed(1).replace(/\.0$/, "")}`;
}

export type MultiplierInfo = {
  mult: number;
  label: string; // "x6"
  reasons: string[]; // ["Argentina", "Final"]
};

export function getMultiplierInfo(
  team_a: string | null | undefined,
  team_b: string | null | undefined,
  stage: string | null | undefined,
): MultiplierInfo | null {
  const mult = getMatchMultiplier(team_a, team_b, stage);
  if (mult === 1) return null;
  const reasons: string[] = [];
  const ta = (team_a ?? "").toLowerCase();
  const tb = (team_b ?? "").toLowerCase();
  const s = (stage ?? "").toLowerCase();
  if (ta.includes("argentina") || tb.includes("argentina")) reasons.push("Argentina");
  const isFinal =
    s.includes("final") && !s.includes("semi") && !s.includes("tercer") &&
    !s.includes("third") && !s.includes("1/2") &&
    !s.includes("cuarto") && !s.includes("quarter") && !s.includes("octavo");
  if (isFinal) reasons.push("Final");
  else if (
    s.includes("octavo") || s.includes("round of 16") || s.includes("last 16") ||
    s.includes("cuarto") || s.includes("quarter") ||
    s.includes("semi") || s.includes("tercer") || s.includes("third") || s.includes("1/2")
  ) {
    reasons.push("Eliminatoria");
  }
  return { mult, label: formatMultiplier(mult), reasons };
}
