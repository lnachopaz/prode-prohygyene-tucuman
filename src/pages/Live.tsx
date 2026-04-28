import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Radio, Clock, Trophy, RefreshCw } from "lucide-react";
import { format, subHours } from "date-fns";
import { es } from "date-fns/locale";
import { Countdown } from "@/components/Countdown";

import { useEffect, useState } from "react";
import { toast } from "sonner";

function calcPoints(pa: number, pb: number, sa: number | null, sb: number | null) {
  if (sa === null || sb === null) return 0;
  if (pa === sa && pb === sb) return 3;
  if (Math.sign(pa - pb) === Math.sign(sa - sb)) return 1;
  return 0;
}

export default function Live() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);

  const syncLive = async (silent = false) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-live-matches");
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["live-match"] });
      if (!silent) toast.success(`Marcadores actualizados (${data?.updated ?? 0})`);
    } catch (e: any) {
      if (!silent) toast.error("Error sincronizando: " + (e?.message ?? "desconocido"));
    } finally {
      setSyncing(false);
    }
  };

  // Auto-sync al montar y cada 30s
  useEffect(() => {
    syncLive(true);
    const id = setInterval(() => syncLive(true), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedIdx, setSelectedIdx] = useState(0);

  // Partidos en vivo (puede haber varios simultáneos) + fallback al próximo
  const { data: liveData, isLoading } = useQuery({
    queryKey: ["live-match"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const nowIso = new Date().toISOString();

      // 1) Todos los partidos marcados como live
      const { data: lives } = await supabase
        .from("matches")
        .select("*")
        .eq("status", "live")
        .order("kickoff_at");
      if (lives && lives.length > 0) return { matches: lives, isLive: true };

      // 2) Partidos cuyo kickoff ya pasó pero aún no están finished
      const { data: ongoing } = await supabase
        .from("matches")
        .select("*")
        .lte("kickoff_at", nowIso)
        .neq("status", "finished")
        .order("kickoff_at", { ascending: false });
      if (ongoing && ongoing.length > 0) return { matches: ongoing, isLive: true };

      // 3) Próximo partido programado
      const { data: next } = await supabase
        .from("matches")
        .select("*")
        .gt("kickoff_at", nowIso)
        .order("kickoff_at")
        .limit(1)
        .maybeSingle();
      return next ? { matches: [next], isLive: false } : null;
    },
  });

  const matches = liveData?.matches ?? [];
  const safeIdx = Math.min(selectedIdx, Math.max(0, matches.length - 1));
  const liveMatch = liveData ? { match: matches[safeIdx], isLive: liveData.isLive } : null;

  const matchId = liveMatch?.match?.id;
  const started = liveMatch ? (liveMatch.isLive || new Date(liveMatch.match.kickoff_at) <= new Date()) : false;
  const predsLocked = liveMatch ? subHours(new Date(liveMatch.match.kickoff_at), 1) <= new Date() : false;

  const { data: predictions } = useQuery({
    queryKey: ["live-predictions", matchId, predsLocked],
    enabled: !!matchId && predsLocked,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: preds } = await supabase
        .from("predictions")
        .select("user_id, pred_a, pred_b, points")
        .eq("match_id", matchId!);
      if (!preds || preds.length === 0) return [];
      const ids = preds.map((p) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      return preds.map((p) => ({
        ...p,
        display_name: profiles?.find((pr) => pr.id === p.user_id)?.display_name ?? "—",
      })).sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    },
  });

  // Mi pronóstico para el partido en vivo
  const { data: myPred } = useQuery({
    queryKey: ["live-my-pred", matchId, user?.id],
    enabled: !!matchId && !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("predictions")
        .select("pred_a, pred_b, points")
        .eq("match_id", matchId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!liveMatch) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Live</h1>
        <Card><CardContent className="p-8 text-center text-muted-foreground">No hay partidos próximos.</CardContent></Card>
      </div>
    );
  }

  const m = liveMatch.match;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Radio className="h-7 w-7 text-primary" /> Live
          </h1>
          <p className="text-muted-foreground">Seguí el partido en vivo y los pronósticos del grupo.</p>
        </div>
      </div>

      {/* Match card */}
      <Card className="border-primary/30 overflow-hidden">
        <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${liveMatch.isLive ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>
          {liveMatch.isLive ? (
            <><span className="h-2 w-2 rounded-full bg-current animate-pulse" /> En vivo</>
          ) : (
            <><Clock className="h-3 w-3" /> Próximo partido</>
          )}
          <span className="ml-auto opacity-80 normal-case font-normal">{m.stage}</span>
        </div>
        <CardContent className="p-6">
          <div className="grid grid-cols-3 items-center gap-4">
            <div className="text-center flex flex-col items-center gap-2">
              {m.team_a_flag && (
                <img src={m.team_a_flag} alt={m.team_a} className="h-12 w-12 md:h-16 md:w-16 object-contain" />
              )}
              <div className="text-sm md:text-xl font-bold">{m.team_a}</div>
            </div>
            <div className="text-center">
              {liveMatch.isLive || m.score_a !== null ? (
                <div className="text-4xl md:text-5xl font-bold tabular-nums">
                  {m.score_a ?? 0} <span className="text-muted-foreground">-</span> {m.score_b ?? 0}
                </div>
              ) : (
                <div className="text-2xl font-bold text-muted-foreground">vs</div>
              )}
              <div className="text-xs text-muted-foreground mt-1">
                {format(new Date(m.kickoff_at), "dd MMM · HH:mm", { locale: es })}
              </div>
            </div>
            <div className="text-center flex flex-col items-center gap-2">
              {m.team_b_flag && (
                <img src={m.team_b_flag} alt={m.team_b} className="h-12 w-12 md:h-16 md:w-16 object-contain" />
              )}
              <div className="text-sm md:text-xl font-bold">{m.team_b}</div>
            </div>
          </div>

          {!started && (
            <div className="mt-6 flex justify-center">
              <Countdown to={m.kickoff_at} />
            </div>
          )}

          {started && (
            <div className="mt-6 rounded-md border bg-muted/40 p-3 text-sm">
              {myPred ? (() => {
                const partial = calcPoints(myPred.pred_a, myPred.pred_b, m.score_a, m.score_b);
                return (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-muted-foreground">
                      Tu pronóstico: <strong className="text-foreground tabular-nums">{myPred.pred_a} - {myPred.pred_b}</strong>
                    </span>
                    <span>
                      <span className="text-muted-foreground mr-2">{m.status === "finished" ? "Final:" : "Parcial:"}</span>
                      {partial === 3 ? <Badge className="bg-success text-success-foreground">+3 pts</Badge>
                        : partial === 1 ? <Badge variant="secondary">+1 pt</Badge>
                        : <Badge variant="outline">0 pts</Badge>}
                    </span>
                  </div>
                );
              })() : (
                <p className="text-muted-foreground text-center">No pronosticaste este partido.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pronósticos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Pronósticos del grupo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!predsLocked ? (
            <p className="text-sm text-muted-foreground">Los pronósticos se mostrarán cuando cierren (1 hora antes del partido).</p>
          ) : !predictions || predictions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nadie pronosticó este partido.</p>
          ) : (
            <div className="space-y-2">
              {predictions.map((p) => {
                const exact = m.score_a !== null && m.score_b !== null && p.pred_a === m.score_a && p.pred_b === m.score_b;
                const result = m.score_a !== null && m.score_b !== null && Math.sign(p.pred_a - p.pred_b) === Math.sign(m.score_a - m.score_b);
                return (
                  <div key={p.user_id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <span className="font-medium truncate">{p.display_name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-bold tabular-nums">{p.pred_a} - {p.pred_b}</span>
                      {liveMatch.isLive || m.status === "finished" ? (
                        exact ? <Badge className="bg-success text-success-foreground">+3</Badge>
                        : result ? <Badge variant="secondary">+1</Badge>
                        : <Badge variant="outline">0</Badge>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
