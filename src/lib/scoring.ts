/**
 * Multiplicadores del Prode 2026.
 *
 * Mundial:
 * - x2 si juega Argentina (siempre, acumula)
 * - Cuartos: x1.2 — Semifinales/3°: x1.5 — Final: x2
 *
 * Champions League: NO aplica multiplicador genérico de fase, pero sí el
 * `multiplier_override` (multiplicador del partido) y `team_multiplier_override`
 * (multiplicador atado a un equipo específico, ej. Bayern x2 + match x1.2 = x2.4).
 *
 * Todos los multiplicadores se acumulan multiplicando.
 */

export type TeamMultiplierOverride = { team: string; mult: number } | null | undefined;

function isUCL(stage: string): boolean {
  return stage.includes("champions");
}

function teamMatches(team: string, target: string): boolean {
  const t = team.toLowerCase();
  const x = target.toLowerCase();
  return t === x || t.includes(x) || x.includes(t);
}

export function getMatchMultiplier(
  team_a: string | null | undefined,
  team_b: string | null | undefined,
  stage: string | null | undefined,
  override?: number | null,
  teamOverride?: TeamMultiplierOverride,
): number {
  let mult = 1;
  const ta = (team_a ?? "").toLowerCase();
  const tb = (team_b ?? "").toLowerCase();
  const s = (stage ?? "").toLowerCase();

  if (ta.includes("argentina") || tb.includes("argentina")) {
    mult *= 2;
  }

  // Multiplicador especial por equipo (cualquier partido)
  if (teamOverride && teamOverride.team && teamOverride.mult > 0) {
    if (teamMatches(team_a ?? "", teamOverride.team) || teamMatches(team_b ?? "", teamOverride.team)) {
      mult *= teamOverride.mult;
    }
  }

  if (isUCL(s)) {
    if (override && override > 0) mult *= override;
    return mult;
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

  const isSemi =
    !isFinal &&
    (s.includes("semi") || s.includes("1/2") || s.includes("tercer") || s.includes("third"));

  const isQuarter = !isFinal && !isSemi && (s.includes("cuarto") || s.includes("quarter"));

  if (isFinal) mult *= 2;
  else if (isSemi) mult *= 1.5;
  else if (isQuarter) mult *= 1.2;

  if (override && override > 0) mult *= override;

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
  override?: number | null,
  teamOverride?: TeamMultiplierOverride,
): MultiplierInfo | null {
  const mult = getMatchMultiplier(team_a, team_b, stage, override, teamOverride);
  if (mult === 1) return null;
  const reasons: string[] = [];
  const ta = (team_a ?? "").toLowerCase();
  const tb = (team_b ?? "").toLowerCase();
  const s = (stage ?? "").toLowerCase();

  if (ta.includes("argentina") || tb.includes("argentina")) reasons.push("Argentina x2");

  if (teamOverride && teamOverride.team && teamOverride.mult > 0) {
    if (teamMatches(team_a ?? "", teamOverride.team) || teamMatches(team_b ?? "", teamOverride.team)) {
      reasons.push(`${teamOverride.team} ${formatMultiplier(teamOverride.mult)}`);
    }
  }

  if (override && override > 0) reasons.push(`Partido especial ${formatMultiplier(override)}`);

  if (!isUCL(s)) {
    const isFinal =
      s.includes("final") && !s.includes("semi") && !s.includes("tercer") &&
      !s.includes("third") && !s.includes("1/2") &&
      !s.includes("cuarto") && !s.includes("quarter") && !s.includes("octavo");
    const isSemi =
      !isFinal && (s.includes("semi") || s.includes("1/2") || s.includes("tercer") || s.includes("third"));
    const isQuarter = !isFinal && !isSemi && (s.includes("cuarto") || s.includes("quarter"));
    if (isFinal) reasons.push("Final x2");
    else if (isSemi) reasons.push("Semifinal/3° x1.5");
    else if (isQuarter) reasons.push("Cuartos x1.2");
  }
  return { mult, label: formatMultiplier(mult), reasons };
}
