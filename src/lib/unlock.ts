// Lógica de desbloqueo progresivo de partidos por "rondas".
// La idea: la siguiente ronda se desbloquea cuando arranca el primer partido
// de la ronda anterior.

export type UnlockMatch = {
  id: string;
  stage: string;
  group_name: string | null;
  kickoff_at: string;
};

type RoundKind = "group" | "ko";

type RoundInfo = {
  kind: RoundKind;
  // identificador de ronda (group:Grupo A:J2 / ko:octavos)
  key: string;
  // etiqueta legible para mostrar al usuario
  label: string;
  // orden dentro de su tipo (1,2,3 para grupos / orden KO)
  order: number;
  // grupo (solo si kind === group)
  group?: string;
};

// Orden de rondas KO. El array está en orden cronológico ascendente.
// Cada item tiene un matcher sobre el texto del stage (case-insensitive, sin tildes).
const KO_ROUNDS: { key: string; label: string; matches: (s: string) => boolean }[] = [
  {
    key: "dieciseisavos",
    label: "Dieciseisavos de final",
    matches: (s) => s.includes("dieciseisavo") || s.includes("treintaidos") || s.includes("32"),
  },
  {
    key: "octavos",
    label: "Octavos de final",
    matches: (s) => s.includes("octavo") || s.includes("round of 16") || s.includes("16avos") || s === "16",
  },
  {
    key: "cuartos",
    label: "Cuartos de final",
    matches: (s) => s.includes("cuarto") || s.includes("quarter"),
  },
  {
    key: "semifinal",
    label: "Semifinales",
    matches: (s) => s.includes("semi"),
  },
  {
    key: "tercero",
    label: "Tercer puesto",
    matches: (s) => s.includes("tercer") || s.includes("third"),
  },
  {
    key: "final",
    label: "Final",
    // muy importante: que no matchee "Semifinal" ni "Tercer puesto"
    matches: (s) => /\bfinal\b/.test(s) && !s.includes("semi") && !s.includes("tercer"),
  },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function detectJornada(stage: string): number | null {
  const n = normalize(stage);
  // "fase de grupos · jornada 2", "jornada 1", "matchday 3", etc.
  const m = n.match(/jornada\s*(\d+)/) ?? n.match(/matchday\s*(\d+)/) ?? n.match(/j\s*(\d+)/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function isGroupStage(stage: string): boolean {
  const n = normalize(stage);
  return n.includes("grupo") || n.includes("group") || detectJornada(stage) !== null;
}

function detectKoRound(stage: string): { key: string; label: string; order: number } | null {
  const n = normalize(stage);
  for (let i = 0; i < KO_ROUNDS.length; i++) {
    const r = KO_ROUNDS[i];
    if (r.matches(n)) return { key: r.key, label: r.label, order: i };
  }
  return null;
}

export function getRoundInfo(match: UnlockMatch): RoundInfo | null {
  if (isGroupStage(match.stage)) {
    const j = detectJornada(match.stage) ?? 1;
    const group = match.group_name ?? "?";
    return {
      kind: "group",
      key: `group:${group}:J${j}`,
      label: `Jornada ${j} de ${group}`,
      order: j,
      group,
    };
  }
  const ko = detectKoRound(match.stage);
  if (ko) {
    return {
      kind: "ko",
      key: `ko:${ko.key}`,
      label: ko.label,
      order: ko.order,
    };
  }
  return null;
}

// Devuelve el primer kickoff de un conjunto de partidos, o null si vacío.
function firstKickoff(ms: UnlockMatch[]): Date | null {
  if (ms.length === 0) return null;
  let min = new Date(ms[0].kickoff_at).getTime();
  for (let i = 1; i < ms.length; i++) {
    const t = new Date(ms[i].kickoff_at).getTime();
    if (t < min) min = t;
  }
  return new Date(min);
}

export type UnlockTrigger = {
  // fecha en la que se desbloquea (kickoff del primer partido de la ronda anterior)
  unlocksAt: Date;
  // etiqueta de la ronda anterior (para mostrar al usuario)
  prevRoundLabel: string;
};

/**
 * Devuelve null si la ronda no tiene precondición (siempre abierta:
 * Jornada 1 de cada grupo). Si tiene precondición, devuelve el momento
 * en que se abre (kickoff del primer partido de la ronda anterior).
 */
export function getUnlockTrigger(
  match: UnlockMatch,
  allMatches: UnlockMatch[],
): UnlockTrigger | null {
  const info = getRoundInfo(match);
  if (!info) return null;

  if (info.kind === "group") {
    // J1 siempre abierta
    if (info.order <= 1) return null;
    const prevJ = info.order - 1;
    const group = info.group!;
    const prev = allMatches.filter((m) => {
      if (!isGroupStage(m.stage)) return false;
      if (m.group_name !== group) return false;
      const j = detectJornada(m.stage) ?? 1;
      return j === prevJ;
    });
    const t = firstKickoff(prev);
    if (!t) return null; // sin datos de la ronda anterior, lo dejamos abierto
    return { unlocksAt: t, prevRoundLabel: `Jornada ${prevJ} de ${group}` };
  }

  // KO: buscar la ronda KO previa que efectivamente exista en el fixture.
  // Si no existe ninguna ronda KO previa, la precondición es la última jornada
  // de fase de grupos (Jornada 3, o la más alta encontrada).
  for (let prevOrder = info.order - 1; prevOrder >= 0; prevOrder--) {
    const prevRoundDef = KO_ROUNDS[prevOrder];
    const prev = allMatches.filter((m) => {
      const ri = getRoundInfo(m);
      return ri?.kind === "ko" && ri.key === `ko:${prevRoundDef.key}`;
    });
    if (prev.length > 0) {
      const t = firstKickoff(prev);
      if (t) return { unlocksAt: t, prevRoundLabel: prevRoundDef.label };
    }
  }

  // Sin ronda KO previa: usar la última jornada de fase de grupos disponible.
  let maxJ = 0;
  allMatches.forEach((m) => {
    if (!isGroupStage(m.stage)) return;
    const j = detectJornada(m.stage) ?? 1;
    if (j > maxJ) maxJ = j;
  });
  if (maxJ > 0) {
    const last = allMatches.filter((m) => {
      if (!isGroupStage(m.stage)) return false;
      return (detectJornada(m.stage) ?? 1) === maxJ;
    });
    const t = firstKickoff(last);
    if (t) return { unlocksAt: t, prevRoundLabel: `Jornada ${maxJ} de fase de grupos` };
  }

  return null;
}

export function isRoundUnlocked(
  match: UnlockMatch,
  allMatches: UnlockMatch[],
  now: Date = new Date(),
): boolean {
  const trig = getUnlockTrigger(match, allMatches);
  if (!trig) return true;
  return now.getTime() >= trig.unlocksAt.getTime();
}
