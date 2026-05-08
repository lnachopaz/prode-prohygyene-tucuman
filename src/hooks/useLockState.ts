import { useEffect, useState } from "react";
import { isAfter, subHours } from "date-fns";

interface MatchInput {
  kickoff_at: string;
  status: "scheduled" | "live" | "finished";
  predictions_lock_mode?: "auto" | "force_open" | "force_closed";
}

interface PredictionWindowInput {
  opens_at: string;
  closes_at: string;
}

export function useLockState(match: MatchInput, predWindow?: PredictionWindowInput) {
  const lockAt = subHours(new Date(match.kickoff_at), 1);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const lockMode = match.predictions_lock_mode ?? "auto";
  const kickoffMs = new Date(match.kickoff_at).getTime();
  const minutesSinceKickoff = (now.getTime() - kickoffMs) / 60000;
  const liveByTime = minutesSinceKickoff >= 0 && minutesSinceKickoff <= 125 && match.status !== "finished";
  const timeLocked = !isAfter(lockAt, now) || match.status !== "scheduled";
  const lockedByAdmin = lockMode === "force_closed";
  const forcedOpen = lockMode === "force_open" && match.status === "scheduled";

  // La ventana sólo determina cuándo ABRE — el cierre siempre es 1h antes del partido.
  const windowOpen = !predWindow
    ? true
    : now >= new Date(predWindow.opens_at);
  const windowNotYetOpen = predWindow ? now < new Date(predWindow.opens_at) : false;
  const windowClosed = false;

  const locked = lockedByAdmin || (!forcedOpen && (timeLocked || !windowOpen));
  const closedByTime = !isAfter(lockAt, now);
  const closesAt = lockAt;

  return {
    now,
    lockAt,
    closesAt,
    liveByTime,
    timeLocked,
    lockedByAdmin,
    forcedOpen,
    windowOpen,
    windowNotYetOpen,
    windowClosed,
    locked,
    closedByTime,
  };
}
