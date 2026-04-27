import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Radio, Clock, Trophy, RefreshCw } from "lucide-react";
import { format, subHours } from "date-fns";
import { es } from "date-fns/locale";
import { Countdown } from "@/components/Countdown";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Live() {
  const queryClient = useQueryClient();
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

  // Match en vivo: status=live, o si no hay, el próximo
  const { data: liveMatch, isLoading } = useQuery({
    queryKey: ["live-match"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: live } = await supabase
        .from("matches")
        .select("*")
        .eq("status", "live")
        .order("kickoff_at")
        .limit(1)
        .maybeSingle();
      if (live) return { match: live, isLive: true };

      const { data: next } = await supabase
        .from("matches")
        .select("*")
        .gt("kickoff_at", new Date().toISOString())
        .order("kickoff_at")
        .limit(1)
        .maybeSingle();
      return next ? { match: next, isLive: false } : null;
    },
  });

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

  // Próximos partidos siguientes
  const { data: upcoming } = useQuery({
    queryKey: ["live-upcoming"],
    queryFn: async () => {
      const { data } = await supabase
        .from("matches")
        .select("*")
        .gt("kickoff_at", new Date().toISOString())
        .order("kickoff_at")
        .limit(5);
      return data ?? [];
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
        <Button variant="outline" size="sm" onClick={() => syncLive(false)} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
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
            <div className="text-center">
              <div className="text-lg md:text-xl font-bold">{m.team_a}</div>
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
            <div className="text-center">
              <div className="text-lg md:text-xl font-bold">{m.team_b}</div>
            </div>
          </div>

          {!started && (
            <div className="mt-6 flex justify-center">
              <Countdown to={m.kickoff_at} />
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

      {/* Próximos */}
      {upcoming && upcoming.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Siguientes partidos</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {upcoming.slice(liveMatch.isLive ? 0 : 1).map((u: any) => (
              <div key={u.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(u.kickoff_at), "EEE dd MMM · HH:mm", { locale: es })}
                  </div>
                  <div className="text-sm font-medium truncate">{u.team_a} vs {u.team_b}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
