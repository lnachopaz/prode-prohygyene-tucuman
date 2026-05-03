import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAll";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Trophy, Loader2, ArrowUp, ArrowDown, Minus, Flame, Crown,
  Medal, Target, ListChecks, TrendingUp, Users, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPoints } from "@/lib/formatPoints";

type PredRow = {
  user_id: string;
  pred_a: number;
  pred_b: number;
  points: number;
  match: {
    id: string;
    stage: string;
    status: string;
    score_a: number | null;
    score_b: number | null;
    kickoff_at: string;
  } | null;
};

type Profile = { id: string; display_name: string; avatar_url: string | null };

type LeaderboardRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_points: number;
  exact_hits: number;
  result_hits: number;
  predictions_count: number;
};

type StageKey = "all" | "groups" | "r16" | "qf" | "sf" | "final";

const STAGE_LABEL: Record<StageKey, string> = {
  all: "Todas",
  groups: "Grupos",
  r16: "Octavos",
  qf: "Cuartos",
  sf: "Semis",
  final: "Final",
};

function stageKey(stage: string): StageKey {
  const s = stage.toLowerCase();
  if (s.includes("grupo") || s.includes("group")) return "groups";
  if (s.includes("octavo") || s.includes("last 16") || s.includes("last 32") || s.includes("round of 16")) return "r16";
  if (s.includes("cuarto") || s.includes("quarter")) return "qf";
  if (s.includes("semi")) return "sf";
  if (s.includes("final") || s.includes("tercer") || s.includes("third")) return "final";
  return "all";
}

type Agg = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_points: number;
  exact_hits: number;
  result_hits: number;
  predictions_count: number;
  finished_count: number;
  streak: number;
};

function aggregate(rows: PredRow[], profiles: Profile[], filter: StageKey): Agg[] {
  const profMap = new Map(profiles.map((p) => [p.id, p]));
  const byUser = new Map<string, PredRow[]>();
  for (const r of rows) {
    if (!r.match) continue;
    if (filter !== "all" && stageKey(r.match.stage) !== filter) continue;
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id)!.push(r);
  }
  const result: Agg[] = [];
  for (const [user_id, list] of byUser) {
    const prof = profMap.get(user_id);
    if (!prof) continue;
    const finished = list.filter((r) => r.match!.status === "finished" || (r.match!.score_a != null && r.match!.score_b != null));
    let total = 0, ex = 0, res = 0;
    for (const r of finished) {
      total += Number(r.points) || 0;
      const m = r.match!;
      const exact = m.score_a != null && m.score_b != null && r.pred_a === m.score_a && r.pred_b === m.score_b;
      const result_ok = !exact && m.score_a != null && m.score_b != null && Math.sign(r.pred_a - r.pred_b) === Math.sign(m.score_a - m.score_b);
      if (exact) ex++;
      else if (result_ok) res++;
    }
    const sorted = [...finished].sort(
      (a, b) => new Date(b.match!.kickoff_at).getTime() - new Date(a.match!.kickoff_at).getTime(),
    );
    let streak = 0;
    for (const r of sorted) {
      if ((r.points || 0) > 0) streak++;
      else break;
    }
    result.push({
      user_id,
      display_name: prof.display_name,
      avatar_url: prof.avatar_url,
      total_points: total,
      exact_hits: ex,
      result_hits: res,
      predictions_count: list.length,
      finished_count: finished.length,
      streak,
    });
  }
  result.sort((a, b) => b.total_points - a.total_points || b.exact_hits - a.exact_hits);
  return result;
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function MedalIcon({ pos }: { pos: number }) {
  if (pos === 1) return <Crown className="h-4 w-4 text-warning" />;
  if (pos === 2) return <Medal className="h-4 w-4 text-muted-foreground" />;
  if (pos === 3) return <Medal className="h-4 w-4 text-amber-700" />;
  return null;
}

export default function Ranking() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<StageKey>("all");

  const { data: leaderboard, isLoading: lLb } = useQuery({
    queryKey: ["ranking-leaderboard"],
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leaderboard")
        .select("*")
        .order("total_points", { ascending: false })
        .order("exact_hits", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeaderboardRow[];
    },
  });

  const { data: preds, isLoading: l1 } = useQuery({
    queryKey: ["ranking-preds-all"],
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const rows = await fetchAllPaginated<PredRow>(() =>
        supabase
          .from("predictions")
          .select("user_id, pred_a, pred_b, points, match:matches(id, stage, status, score_a, score_b, kickoff_at)")
          .order("user_id", { ascending: true }),
      );
      return rows;
    },
  });

  const { data: profiles, isLoading: l2 } = useQuery({
    refetchOnMount: "always",
    staleTime: 0,
    queryKey: ["ranking-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, display_name, avatar_url");
      if (error) throw error;
      return data as Profile[];
    },
  });

  // Tournament-wide stats
  const { data: matchStats } = useQuery({
    queryKey: ["ranking-match-stats"],
    queryFn: async () => {
      const { data } = await supabase.from("matches").select("id, status");
      const total = data?.length ?? 0;
      const finished = data?.filter((m) => m.status === "finished").length ?? 0;
      return { total, finished };
    },
  });

  const streakByUser = useMemo(() => {
    const map = new Map<string, number>();
    if (!preds) return map;
    const grouped = new Map<string, PredRow[]>();
    for (const r of preds) {
      if (!r.match) continue;
      const finished = r.match.status === "finished" || (r.match.score_a != null && r.match.score_b != null);
      if (!finished) continue;
      if (!grouped.has(r.user_id)) grouped.set(r.user_id, []);
      grouped.get(r.user_id)!.push(r);
    }
    for (const [uid, list] of grouped) {
      const sorted = list.sort(
        (a, b) => new Date(b.match!.kickoff_at).getTime() - new Date(a.match!.kickoff_at).getTime(),
      );
      let s = 0;
      for (const r of sorted) {
        if ((r.points || 0) > 0) s++;
        else break;
      }
      map.set(uid, s);
    }
    return map;
  }, [preds]);

  const profMap = useMemo(() => new Map((profiles ?? []).map((p) => [p.id, p])), [profiles]);

  const current = useMemo<Agg[]>(() => {
    if (filter === "all") {
      if (!leaderboard) return [];
      return leaderboard.map((r) => ({
        user_id: r.user_id,
        display_name: r.display_name,
        avatar_url: r.avatar_url ?? profMap.get(r.user_id)?.avatar_url ?? null,
        total_points: r.total_points || 0,
        exact_hits: r.exact_hits || 0,
        result_hits: r.result_hits || 0,
        predictions_count: r.predictions_count || 0,
        finished_count: matchStats?.finished ?? 0,
        streak: streakByUser.get(r.user_id) ?? 0,
      }));
    }
    if (!preds || !profiles) return [];
    return aggregate(preds, profiles, filter);
  }, [filter, leaderboard, preds, profiles, streakByUser, profMap, matchStats?.finished]);

  const previous = useMemo(() => {
    if (filter !== "all" || !preds || !profiles) return new Map<string, number>();
    const finishedKickoffs = preds
      .map((r) => r.match)
      .filter((m): m is NonNullable<PredRow["match"]> => !!m && (m.status === "finished" || (m.score_a != null && m.score_b != null)))
      .map((m) => m.kickoff_at)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    if (finishedKickoffs.length === 0) return new Map();
    const lastDay = finishedKickoffs[0].slice(0, 10);
    const filtered = preds.filter((r) => !r.match || r.match.kickoff_at.slice(0, 10) !== lastDay);
    const prev = aggregate(filtered, profiles, "all");
    const map = new Map<string, number>();
    prev.forEach((p, i) => map.set(p.user_id, i + 1));
    return map;
  }, [filter, preds, profiles]);

  const bestByStage = useMemo(() => {
    if (!preds || !profiles) return {} as Record<StageKey, Agg | undefined>;
    const out: Record<string, Agg | undefined> = {};
    (["groups", "r16", "qf", "sf", "final"] as StageKey[]).forEach((k) => {
      const agg = aggregate(preds, profiles, k);
      out[k] = agg.find((a) => a.finished_count > 0);
    });
    return out as Record<StageKey, Agg | undefined>;
  }, [preds, profiles]);

  // Personal stats
  const myStats = useMemo(() => {
    if (!user || current.length === 0) return null;
    const idx = current.findIndex((r) => r.user_id === user.id);
    if (idx === -1) return null;
    const me = current[idx];
    const leader = current[0];
    const next = idx > 0 ? current[idx - 1] : null;
    const below = idx < current.length - 1 ? current[idx + 1] : null;
    const finishedRef = filter === "all" ? (matchStats?.finished ?? 0) : me.finished_count;
    const avg = finishedRef > 0 ? (me.total_points / finishedRef) : 0;
    return {
      pos: idx + 1,
      total: current.length,
      me,
      gapLeader: idx === 0 ? 0 : leader.total_points - me.total_points,
      gapNext: next ? next.total_points - me.total_points : null,
      gapBelow: below ? me.total_points - below.total_points : null,
      avg,
    };
  }, [current, user, filter, matchStats?.finished]);

  const globalStats = useMemo(() => {
    const players = current.length;
    const totalPreds = current.reduce((acc, r) => acc + r.predictions_count, 0);
    const totalExact = current.reduce((acc, r) => acc + r.exact_hits, 0);
    const totalResult = current.reduce((acc, r) => acc + r.result_hits, 0);
    return { players, totalPreds, totalExact, totalResult, leader: current[0] };
  }, [current]);

  if (lLb || l1 || l2) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Trophy className="h-7 w-7 text-primary" /> Ranking
        </h1>
        <p className="text-muted-foreground text-sm">3 pts por pleno · 1 pt por acertar el resultado</p>
      </div>

      {/* My position card */}
      {myStats && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Mi posición</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-primary">#{myStats.pos}</span>
                  <span className="text-sm text-muted-foreground">de {myStats.total}</span>
                  <MedalIcon pos={myStats.pos} />
                </div>
                <div className="text-sm text-muted-foreground mt-1 truncate">{myStats.me.display_name}</div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Mis puntos</div>
                <div className="text-3xl font-bold tabular-nums">{formatPoints(myStats.me.total_points)}</div>
                <div className="text-xs text-muted-foreground">{formatPoints(myStats.avg)} prom/partido</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="rounded-md bg-background/60 border p-2 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">Plenos</div>
                <div className="text-lg font-bold text-success tabular-nums">{myStats.me.exact_hits}</div>
              </div>
              <div className="rounded-md bg-background/60 border p-2 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">Resultados</div>
                <div className="text-lg font-bold text-warning tabular-nums">{myStats.me.result_hits}</div>
              </div>
              <div className="rounded-md bg-background/60 border p-2 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">Racha</div>
                <div className="text-lg font-bold tabular-nums flex items-center justify-center gap-1">
                  {myStats.me.streak > 0 && <Flame className="h-4 w-4 text-orange-500" />}
                  {myStats.me.streak}
                </div>
              </div>
            </div>

            {(myStats.gapLeader > 0 || myStats.gapNext !== null || myStats.gapBelow !== null) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
                {myStats.gapLeader > 0 && (
                  <span>−<strong className="text-foreground">{myStats.gapLeader}</strong> del líder</span>
                )}
                {myStats.gapNext !== null && myStats.gapNext > 0 && (
                  <span>−<strong className="text-foreground">{myStats.gapNext}</strong> del #{myStats.pos - 1}</span>
                )}
                {myStats.gapBelow !== null && myStats.gapBelow > 0 && (
                  <span>+<strong className="text-success">{myStats.gapBelow}</strong> sobre #{myStats.pos + 1}</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}


      {/* Best per stage */}
      <Card>
        <CardContent className="p-4">
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-3 flex items-center gap-2">
            <Crown className="h-3.5 w-3.5" /> Mejor por fase
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(["groups", "r16", "qf", "sf", "final"] as StageKey[]).map((k) => {
              const b = bestByStage[k];
              return (
                <div key={k} className="rounded-md border bg-muted/30 p-2 text-center">
                  <div className="text-[10px] uppercase text-muted-foreground">{STAGE_LABEL[k]}</div>
                  <div className="font-medium text-sm truncate" title={b?.display_name}>
                    {b?.display_name ?? "—"}
                  </div>
                  <div className="text-xs text-primary font-semibold">{formatPoints(b?.total_points ?? 0)} pts</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filter */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as StageKey)}>
        <TabsList className="grid grid-cols-6 w-full">
          {(Object.keys(STAGE_LABEL) as StageKey[]).map((k) => (
            <TabsTrigger key={k} value={k} className="text-xs sm:text-sm">{STAGE_LABEL[k]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Ranking list */}
      <Card>
        <CardContent className="p-0">
          {/* Desktop header */}
          <div className="hidden sm:grid sm:grid-cols-[40px_24px_1fr_70px_60px_60px_60px_70px] gap-2 px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase border-b">
            <span>#</span>
            <span></span>
            <span>Jugador</span>
            <span className="text-center">Pronós</span>
            <span className="text-center">Plenos</span>
            <span className="text-center">Result.</span>
            <span className="text-center">Racha</span>
            <span className="text-right">Total</span>
          </div>

          <div className="divide-y">
            {current.map((row, i) => {
              const isMe = row.user_id === user?.id;
              const pos = i + 1;
              const prevPos = previous.get(row.user_id);
              const delta = filter === "all" && prevPos ? prevPos - pos : 0;
              const deltaIcon = filter === "all" && prevPos ? (
                delta > 0 ? <ArrowUp className="h-3.5 w-3.5 text-success" /> :
                delta < 0 ? <ArrowDown className="h-3.5 w-3.5 text-destructive" /> :
                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
              ) : null;

              return (
                <div
                  key={row.user_id}
                  className={cn(
                    "px-3 sm:px-4",
                    isMe && "bg-primary/5 border-l-4 border-l-primary",
                  )}
                >
                  {/* MOBILE LAYOUT */}
                  <div className="sm:hidden py-3 flex items-center gap-3">
                    <div className="flex flex-col items-center w-8 shrink-0">
                      <span className={cn(
                        "font-bold text-base leading-none",
                        pos === 1 && "text-warning",
                        pos === 2 && "text-muted-foreground",
                        pos === 3 && "text-amber-700",
                      )}>{pos}</span>
                      {deltaIcon && <span className="mt-0.5">{deltaIcon}</span>}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm truncate">{row.display_name}</span>
                        {isMe && <span className="text-[10px] text-primary font-semibold">(vos)</span>}
                        <MedalIcon pos={pos} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                        <span className="text-success font-semibold">✓{row.exact_hits}</span>
                        <span className="text-warning font-semibold">~{row.result_hits}</span>
                        {row.streak >= 2 && (
                          <span className="flex items-center gap-0.5 text-orange-500 font-semibold">
                            <Flame className="h-3 w-3" />{row.streak}
                          </span>
                        )}
                        <span className="text-muted-foreground">· {row.predictions_count} pron.</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xl font-bold tabular-nums leading-none">{formatPoints(row.total_points)}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">pts</div>
                    </div>
                  </div>

                  {/* DESKTOP LAYOUT */}
                  <div className="hidden sm:grid sm:grid-cols-[40px_24px_1fr_70px_60px_60px_60px_70px] gap-2 py-3 items-center text-sm">
                    <span className={cn(
                      "font-bold text-base flex items-center gap-1",
                      pos === 1 && "text-warning",
                      pos === 2 && "text-muted-foreground",
                      pos === 3 && "text-amber-700",
                    )}>
                      {pos}
                      <MedalIcon pos={pos} />
                    </span>
                    <span>{deltaIcon}</span>
                    <span className="font-medium truncate flex items-center gap-2 min-w-0">
                      <span className="truncate">{row.display_name}</span>
                      {isMe && <span className="text-xs text-primary">(vos)</span>}
                    </span>
                    <span className="text-center text-muted-foreground tabular-nums">{row.predictions_count}</span>
                    <span className="text-center text-success font-semibold tabular-nums">{row.exact_hits}</span>
                    <span className="text-center text-warning font-semibold tabular-nums">{row.result_hits}</span>
                    <span className="text-center">
                      {row.streak >= 2 ? (
                        <Badge variant="secondary" className="px-1.5 py-0 text-xs gap-0.5">
                          <Flame className="h-3 w-3 text-orange-500" />{row.streak}
                        </Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </span>
                    <span className="text-right font-bold text-base tabular-nums">{row.total_points}</span>
                  </div>
                </div>
              );
            })}

            {current.length === 0 && (
              <div className="px-4 py-12 text-center text-muted-foreground text-sm">Aún no hay puntos en esta fase.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1 mb-0.5">
          {icon}{label}
        </div>
        <div className="text-lg font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
