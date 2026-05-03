import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, ListChecks, Calendar, Target, TrendingUp, Loader2, Radio } from "lucide-react";
import { Countdown } from "@/components/Countdown";
import { formatAR } from "@/lib/datetime";
import { TournamentRules } from "@/components/TournamentRules";
import { getMultiplierInfo } from "@/lib/scoring";
import { formatPoints } from "@/lib/formatPoints";
import { Sparkles } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: fullLb }, { data: matches }, { data: preds }] = await Promise.all([
        supabase
          .from("leaderboard")
          .select("user_id, total_points, exact_hits, result_hits")
          .order("total_points", { ascending: false })
          .order("exact_hits", { ascending: false }),
        supabase.from("matches").select("id,status,kickoff_at"),
        supabase.from("predictions").select("match_id").eq("user_id", user!.id),
      ]);
      const total = matches?.length ?? 0;
      const finished = matches?.filter((m) => m.status === "finished").length ?? 0;
      const upcoming = matches?.filter((m) => new Date(m.kickoff_at) > new Date()).length ?? 0;
      const lbArr = fullLb ?? [];
      const myIdx = lbArr.findIndex((r: any) => r.user_id === user!.id);
      const me = myIdx >= 0 ? lbArr[myIdx] : null;
      return {
        points: me?.total_points ?? 0,
        exact: me?.exact_hits ?? 0,
        results: me?.result_hits ?? 0,
        predictionsCount: preds?.length ?? 0,
        totalMatches: total,
        finishedMatches: finished,
        upcomingMatches: upcoming,
        position: myIdx >= 0 ? myIdx + 1 : null,
        totalPlayers: lbArr.length,
      };
    },
  });

  const { data: nextMatches } = useQuery({
    queryKey: ["dashboard-next-matches"],
    queryFn: async () => {
      // Incluye partidos en vivo + próximos a arrancar (kickoff > ahora)
      const { data } = await supabase
        .from("matches")
        .select("*")
        .or(`status.eq.live,kickoff_at.gt.${new Date().toISOString()}`)
        .order("status", { ascending: false }) // 'scheduled' < 'live' alfabéticamente, pero queremos live primero
        .order("kickoff_at")
        .limit(5);
      // Reordenar manualmente: live primero, luego por kickoff
      return (data ?? []).sort((a, b) => {
        if (a.status === "live" && b.status !== "live") return -1;
        if (b.status === "live" && a.status !== "live") return 1;
        return new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
      });
    },
    refetchInterval: 30000, // refrescar cada 30s para captar partidos que pasan a en vivo
  });

  const { data: topRanking } = useQuery({
    queryKey: ["dashboard-top-ranking"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leaderboard")
        .select("*")
        .order("total_points", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const pendingPredictions = (stats?.upcomingMatches ?? 0) - (stats?.predictionsCount ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold">Resumen</h1>
          <p className="text-muted-foreground">Tu Prode del Mundial 2026 de un vistazo.</p>
        </div>
        <Button asChild>
          <Link to="/predictions"><ListChecks className="h-4 w-4 mr-2" />Cargar pronósticos</Link>
        </Button>
      </div>

      {/* Featured: live or next match */}
      {nextMatches && nextMatches[0] && (() => {
        const featured = nextMatches[0];
        const isLive = featured.status === "live";
        const multInfo = getMultiplierInfo(featured.team_a, featured.team_b, featured.stage);
        return (
          <Card className={isLive ? "border-destructive/50 bg-gradient-to-br from-destructive/10 to-transparent" : "border-primary/30 bg-gradient-to-br from-primary/10 to-transparent"}>
            <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className={`text-xs uppercase tracking-wider font-semibold mb-1 flex items-center gap-2 ${isLive ? "text-destructive" : "text-primary"}`}>
                  <Radio className={`h-3 w-3 ${isLive ? "animate-pulse" : ""}`} />
                  {isLive ? "En juego" : "Próximo partido"}
                  {multInfo && (
                    <Badge className="gap-1 bg-amber-500 hover:bg-amber-500 text-white" title={multInfo.reasons.join(" + ")}>
                      <Sparkles className="h-3 w-3" />{multInfo.label}
                    </Badge>
                  )}
                </div>
                <div className="text-lg font-bold truncate">{featured.team_a} vs {featured.team_b}</div>
                <div className="text-xs text-muted-foreground">
                  {formatAR(featured.kickoff_at, "EEEE dd MMM · HH:mm 'hs'")}
                </div>
              </div>
              {isLive ? (
                <div className="flex flex-col items-center md:items-end">
                  <div className="text-sm text-muted-foreground italic">
                    Resultado al finalizar
                  </div>
                </div>
              ) : (
                <Countdown to={featured.kickoff_at} />
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Trophy className="h-4 w-4" />} label="Mis puntos" value={formatPoints(stats?.points ?? 0)} />
        <StatCard icon={<Target className="h-4 w-4" />} label="Plenos" value={stats?.exact ?? 0} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Aciertos resultado" value={stats?.results ?? 0} />
        <StatCard icon={<ListChecks className="h-4 w-4" />} label="Pronósticos" value={`${stats?.predictionsCount ?? 0}/${stats?.totalMatches ?? 0}`} />
      </div>

      {stats?.position && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm">
              Estás en el puesto <strong className="text-primary text-base">#{stats.position}</strong> de <strong>{stats.totalPlayers}</strong> participantes.
            </div>
            <Button size="sm" variant="outline" asChild><Link to="/ranking">Ver ranking completo</Link></Button>
          </CardContent>
        </Card>
      )}

      {pendingPredictions > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm">
              Tenés <strong>{pendingPredictions}</strong> partido{pendingPredictions !== 1 ? "s" : ""} próximo{pendingPredictions !== 1 ? "s" : ""} sin pronosticar.
            </div>
            <Button size="sm" asChild><Link to="/predictions">Pronosticar ahora</Link></Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Próximos partidos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" />Próximos partidos</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link to="/predictions">Ver todos</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {nextMatches?.length === 0 && <p className="text-sm text-muted-foreground">No hay partidos próximos.</p>}
            {nextMatches?.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground truncate">
                    {formatAR(m.kickoff_at, "EEE dd MMM · HH:mm 'hs'")}
                    {m.group_name ? ` · Grupo ${m.group_name}` : ""}
                  </div>
                  <div className="font-medium text-sm truncate">{m.team_a} vs {m.team_b}</div>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">{m.stage.split(" · ")[0]}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top ranking */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4" />Top 5 ranking</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link to="/ranking">Ver completo</Link></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {topRanking?.length === 0 && <p className="text-sm text-muted-foreground">Sin datos aún.</p>}
            {topRanking?.map((u: any, i: number) => (
              <div key={u.user_id} className={`flex items-center justify-between py-2 border-b last:border-0 ${u.user_id === user?.id ? "bg-primary/5 rounded px-2 -mx-2" : ""}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-bold w-6 text-center text-muted-foreground">{i + 1}</span>
                  <span className="font-medium truncate">{u.display_name}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold">{formatPoints(u.total_points)} pts</div>
                  <div className="text-xs text-muted-foreground">{u.exact_hits} plenos</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Tournament progress */}
      <Card>
        <CardHeader><CardTitle className="text-base">Progreso del torneo</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2 text-sm">
            <span>{stats?.finishedMatches ?? 0} / {stats?.totalMatches ?? 0} partidos jugados</span>
            <span className="text-muted-foreground">
              {stats?.totalMatches ? Math.round((stats.finishedMatches / stats.totalMatches) * 100) : 0}%
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full transition-all"
              style={{ width: `${stats?.totalMatches ? (stats.finishedMatches / stats.totalMatches) * 100 : 0}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <TournamentRules />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-muted-foreground text-xs flex items-center gap-1 mb-1">{icon}{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
