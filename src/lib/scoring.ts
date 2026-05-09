/**
 * Multiplicadores del Prode 2026:
 * - x2 si juega Argentina
 * - x8 en la final del Mundial
 * - x4 en semifinales y 3° puesto
 * - x2 en cuartos de final
 * - x2 en octavos de final
 * - x1 en dieciseisavos (sin multiplicador)
 * Se acumulan: una final con Argentina = x16.
 */

function isFinalStage(s: string): boolean {
  return (
    s.includes("final") &&
    !s.includes("semi") &&
    !s.includes("tercer") &&
    !s.includes("third") &&
    !s.includes("1/2") &&
    !s.includes("cuarto") &&
    !s.includes("quarter") &&
    !s.includes("octavo") &&
    !s.includes("dieciseis") &&
    !s.includes("round of 16") &&
    !s.includes("last 16") &&
    !s.includes("round of 32") &&
    !s.includes("last 32")
  );
}

function isSemiOrThirdStage(s: string): boolean {
  return (
    s.includes("semi") ||
    s.includes("tercer") ||
    s.includes("third") ||
    s.includes("1/2")
  );
}

function isQuarterStage(s: string): boolean {
  return s.includes("cuarto") || s.includes("quarter");
}

function isRoundOf16Stage(s: string): boolean {
  return (
    s.includes("octavo") ||
    s.includes("round of 16") ||
    s.includes("last 16")
  );
}

export function getMatchMultiplier(
  team_a: string | null | undefined,
  team_b: string | null | undefined,
  stage: string | null | undefined,
  pointMult?: number | null,
  teamAMult?: number | null,
  teamBMult?: number | null,
): number {
  let mult = 1;
  const ta = (team_a ?? "").toLowerCase();
  const tb = (team_b ?? "").toLowerCase();
  const s = (stage ?? "").toLowerCase();

  if (ta.includes("argentina") || tb.includes("argentina")) mult *= 2;

  if (isFinalStage(s)) mult *= 8;
  else if (isSemiOrThirdStage(s)) mult *= 4;
  else if (isQuarterStage(s)) mult *= 2;
  else if (isRoundOf16Stage(s)) mult *= 2;

  if (pointMult && pointMult !== 1) mult *= pointMult;
  if (teamAMult && teamAMult !== 1) mult *= teamAMult;
  if (teamBMult && teamBMult !== 1) mult *= teamBMult;

  return Math.round(mult * 100) / 100;
}

export function formatMultiplier(mult: number): string {
  if (Number.isInteger(mult)) return `x${mult}`;
  return `x${mult.toFixed(1).replace(/\.0$/, "")}`;
}

export type MultiplierInfo = {
  mult: number;
  label: string;
  reasons: string[];
  parts: Array<{ label: string; mult: number }>;
};

export function getMultiplierInfo(
  team_a: string | null | undefined,
  team_b: string | null | undefined,
  stage: string | null | undefined,
  pointMult?: number | null,
  teamAMult?: number | null,
  teamBMult?: number | null,
): MultiplierInfo | null {
  const mult = getMatchMultiplier(team_a, team_b, stage, pointMult, teamAMult, teamBMult);
  if (mult === 1) return null;
  const reasons: string[] = [];
  const parts: Array<{ label: string; mult: number }> = [];
  const ta = (team_a ?? "").toLowerCase();
  const tb = (team_b ?? "").toLowerCase();
  const s = (stage ?? "").toLowerCase();
  if (ta.includes("argentina") || tb.includes("argentina")) {
    reasons.push("Argentina"); parts.push({ label: "Argentina", mult: 2 });
  }
  if (isFinalStage(s)) { reasons.push("Final"); parts.push({ label: "Final", mult: 8 }); }
  else if (isSemiOrThirdStage(s)) { reasons.push("Semis/3° puesto"); parts.push({ label: "Semis", mult: 4 }); }
  else if (isQuarterStage(s)) { reasons.push("Cuartos"); parts.push({ label: "Cuartos", mult: 2 }); }
  else if (isRoundOf16Stage(s)) { reasons.push("Octavos"); parts.push({ label: "Octavos", mult: 2 }); }
  if (pointMult && pointMult !== 1) { reasons.push(`x${pointMult}`); parts.push({ label: "Manual", mult: pointMult }); }
  if (teamAMult && teamAMult !== 1) { reasons.push(`${team_a} x${teamAMult}`); parts.push({ label: team_a ?? "A", mult: teamAMult }); }
  if (teamBMult && teamBMult !== 1) { reasons.push(`${team_b} x${teamBMult}`); parts.push({ label: team_b ?? "B", mult: teamBMult }); }
  return { mult, label: formatMultiplier(mult), reasons, parts };
}

/**
 * Formatea un puntaje. Si es entero (3, 5, 12) lo muestra sin decimales;
 * si tiene parte decimal significativa (5.2, 3.6) muestra 1 decimal.
 */
export function formatPoints(p: number | string | null | undefined): string {
  const n = typeof p === "string" ? parseFloat(p) : (p ?? 0);
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
}

/** Suma puntos asegurando precisión decimal de 1 dígito. */
export function sumPoints(arr: Array<number | string | null | undefined>): number {
  const total = arr.reduce<number>((s, x) => {
    const n = typeof x === "string" ? parseFloat(x) : (x ?? 0);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  return Math.round(total * 10) / 10;
}

/** ¿La predicción es un pleno (resultado exacto)? */
export function isPleno(pa: number, pb: number, sa: number | null, sb: number | null): boolean {
  return sa != null && sb != null && pa === sa && pb === sb;
}

/** ¿La predicción acertó ganador/empate (sin ser pleno)? */
export function isResultHit(pa: number, pb: number, sa: number | null, sb: number | null): boolean {
  if (sa == null || sb == null) return false;
  if (pa === sa && pb === sb) return false;
  return Math.sign(pa - pb) === Math.sign(sa - sb);
}
