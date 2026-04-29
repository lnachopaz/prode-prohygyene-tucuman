import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAll";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Trophy, Loader2, ArrowUp, ArrowDown, Minus, Flame, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

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
      total += r.points || 0;
      if (r.points === 3) ex++;
      else if (r.points === 1) res++;
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

export default function Ranking() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<StageKey>("all");

  // Server-side leaderboard (1 row per user, no row limit issue) → used for "all" mode
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

  // ALL predictions, paginated — used for stage filters, streak, best-by-stage, and ↑/↓ deltas
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

  // Streak per user (always computed across all stages)
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

  // Current ranking with filter
  const current = useMemo<Agg[]>(() => {
    if (filter === "all") {
      if (!leaderboard) return [];
      return leaderboard.map((r) => ({
        user_id: r.user_id,
        display_name: r.display_name,
        total_points: r.total_points || 0,
        exact_hits: r.exact_hits || 0,
        result_hits: r.result_hits || 0,
        predictions_count: r.predictions_count || 0,
        finished_count: 0, // not used in render
        streak: streakByUser.get(r.user_id) ?? 0,
      }));
    }
    if (!preds || !profiles) return [];
    return aggregate(preds, profiles, filter);
  }, [filter, leaderboard, preds, profiles, streakByUser]);

  // Previous ranking (excluding the most recent finished matchday) — only "all" mode
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

  // Best per stage
  const bestByStage = useMemo(() => {
    if (!preds || !profiles) return {} as Record<StageKey, Agg | undefined>;
    const out: Record<string, Agg | undefined> = {};
    (["groups", "r16", "qf", "sf", "final"] as StageKey[]).forEach((k) => {
      const agg = aggregate(preds, profiles, k);
      out[k] = agg.find((a) => a.finished_count > 0);
    });
    return out as Record<StageKey, Agg | undefined>;
  }, [preds, profiles]);

  if (lLb || l1 || l2) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Trophy className="h-7 w-7 text-primary" /> Ranking
        </h1>
        <p className="text-muted-foreground">3 pts por pleno · 1 pt por acertar el resultado</p>
      </div>

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
                  <div className="text-xs text-primary font-semibold">{b?.total_points ?? 0} pts</div>
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
            <TabsTrigger key={k} value={k}>{STAGE_LABEL[k]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            <div className="grid grid-cols-[36px_24px_1fr_44px_50px_50px_60px] gap-2 px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase">
              <span>#</span>
              <span></span>
              <span>Jugador</span>
              <span className="text-center">🔥</span>
              <span className="text-center">Plen.</span>
              <span className="text-center">Res.</span>
              <span className="text-right">Total</span>
            </div>
            {current.map((row, i) => {
              const isMe = row.user_id === user?.id;
              const pos = i + 1;
              const prevPos = previous.get(row.user_id);
              const delta = filter === "all" && prevPos ? prevPos - pos : 0;
              return (
                <div
                  key={row.user_id}
                  className={cn(
                    "grid grid-cols-[36px_24px_1fr_44px_50px_50px_60px] gap-2 px-3 py-3 items-center text-sm",
                    isMe && "bg-primary/5",
                  )}
                >
                  <span className={cn(
                    "font-bold text-base",
                    pos === 1 && "text-warning",
                    pos === 2 && "text-muted-foreground",
                    pos === 3 && "text-amber-700",
                  )}>{pos}</span>
                  <span>
                    {filter === "all" && prevPos ? (
                      delta > 0 ? <ArrowUp className="h-3.5 w-3.5 text-success" /> :
                      delta < 0 ? <ArrowDown className="h-3.5 w-3.5 text-destructive" /> :
                      <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : null}
                  </span>
                  <span className="font-medium truncate flex items-center gap-2">
                    {row.display_name}
                    {isMe && <span className="text-xs text-primary">(vos)</span>}
                  </span>
                  <span className="text-center">
                    {row.streak >= 2 ? (
                      <Badge variant="secondary" className="px-1.5 py-0 text-xs gap-0.5">
                        <Flame className="h-3 w-3 text-orange-500" />{row.streak}
                      </Badge>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </span>
                  <span className="text-center text-success font-semibold">{row.exact_hits}</span>
                  <span className="text-center text-warning font-semibold">{row.result_hits}</span>
                  <span className="text-right font-bold text-base">{row.total_points}</span>
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
