import { useEffect, useMemo, useState } from "react";

function parseTarget(to: string | Date): Date {
  if (to instanceof Date) return to;
  // Normalize Postgres-style "2026-06-12 19:00:00+00" → ISO "2026-06-12T19:00:00+00:00"
  let s = to.trim().replace(" ", "T");
  // "+00" → "+00:00" (Safari requires colon in offset)
  s = s.replace(/([+-]\d{2})$/, "$1:00");
  return new Date(s);
}

function diff(target: Date) {
  const targetMs = target.getTime();
  if (Number.isNaN(targetMs)) {
    return { d: 0, h: 0, m: 0, s: 0, done: true };
  }
  const ms = Math.max(0, targetMs - Date.now());
  const totalSec = Math.floor(ms / 1000);
  return {
    d: Math.floor(totalSec / 86400),
    h: Math.floor((totalSec % 86400) / 3600),
    m: Math.floor((totalSec % 3600) / 60),
    s: totalSec % 60,
    done: ms === 0,
  };
}

export function Countdown({ to, className }: { to: string | Date; className?: string }) {
  const target = useMemo(() => parseTarget(to), [to]);
  const [t, setT] = useState(() => diff(target));

  useEffect(() => {
    setT(diff(target));
    const i = setInterval(() => setT(diff(target)), 1000);
    return () => clearInterval(i);
  }, [target]);

  if (t.done) {
    return <span className={className}>¡En curso!</span>;
  }

  const cell = (n: number, lbl: string) => (
    <div className="flex flex-col items-center">
      <span className="text-2xl md:text-3xl font-bold tabular-nums">{n.toString().padStart(2, "0")}</span>
      <span className="text-[10px] uppercase text-muted-foreground tracking-wider">{lbl}</span>
    </div>
  );

  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      {cell(t.d, "días")}
      <span className="text-xl text-muted-foreground">:</span>
      {cell(t.h, "hs")}
      <span className="text-xl text-muted-foreground">:</span>
      {cell(t.m, "min")}
      <span className="text-xl text-muted-foreground">:</span>
      {cell(t.s, "seg")}
    </div>
  );
}
