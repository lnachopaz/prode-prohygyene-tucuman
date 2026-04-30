/**
 * Multiplicadores del Prode 2026 (solo Mundial; UCL no aplica multiplicadores de fase):
 * - x2 si juega Argentina (siempre, acumula)
 * - Dieciseisavos: sin multiplicador de fase
 * - Octavos: sin multiplicador de fase
 * - Cuartos: x1.2
 * - Semifinales / 3° puesto: x1.5
 * - Final: x2
 * Se acumulan: una final con Argentina = x4.
 */

function isUCL(stage: string): boolean {
  return stage.includes("champions");
}

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

  if (isUCL(s)) return mult;

  const isFinal =
    s.includes("final") &&
    !s.includes("semi") &&
    !s.includes("tercer") &&
    !s.includes("third") &&
    !s.includes("1/2") &&
    !s.includes("cuarto") &&
    !s.includes("quarter") &&
    !s.includes("octavo");

  const isSemi =
    !isFinal &&
    (s.includes("semi") || s.includes("1/2") || s.includes("tercer") || s.includes("third"));

  const isQuarter = !isFinal && !isSemi && (s.includes("cuarto") || s.includes("quarter"));

  if (isFinal) mult *= 2;
  else if (isSemi) mult *= 1.5;
  else if (isQuarter) mult *= 1.2;

  return mult;
}

export function formatMultiplier(mult: number): string {
  if (Number.isInteger(mult)) return `x${mult}`;
  return `x${mult.toFixed(1).replace(/\.0$/, "")}`;
}

export type MultiplierInfo = {
  mult: number;
  label: string;
  reasons: string[];
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

  if (!isUCL(s)) {
    const isFinal =
      s.includes("final") && !s.includes("semi") && !s.includes("tercer") &&
      !s.includes("third") && !s.includes("1/2") &&
      !s.includes("cuarto") && !s.includes("quarter") && !s.includes("octavo");
    const isSemi =
      !isFinal && (s.includes("semi") || s.includes("1/2") || s.includes("tercer") || s.includes("third"));
    const isQuarter = !isFinal && !isSemi && (s.includes("cuarto") || s.includes("quarter"));
    if (isFinal) reasons.push("Final");
    else if (isSemi) reasons.push("Semifinal / 3° puesto");
    else if (isQuarter) reasons.push("Cuartos");
  }
  return { mult, label: formatMultiplier(mult), reasons };
}
