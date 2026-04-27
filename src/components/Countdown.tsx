import { useEffect, useState } from "react";

function diff(target: Date) {
  const ms = Math.max(0, target.getTime() - Date.now());
  const s = Math.floor(ms / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    done: ms === 0,
  };
}

export function Countdown({ to, className }: { to: string | Date; className?: string }) {
  const target = typeof to === "string" ? new Date(to) : to;
  const [t, setT] = useState(() => diff(target));

  useEffect(() => {
    const i = setInterval(() => setT(diff(target)), 1000);
    return () => clearInterval(i);
  }, [target.getTime()]);

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
