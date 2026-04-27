import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, ListChecks, Calendar, Target, TrendingUp, Loader2, Radio } from "lucide-react";
import { Countdown } from "@/components/Countdown";
import { Flag } from "@/components/Flag";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Dashboard() {
  const { user } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: lb }, { data: matches }, { data: preds }] = await Promise.all([
        supabase.from("leaderboard").select("*").eq("user_id", user!.id).maybeSingle(),
        supabase.from("matches").select("id,status,kickoff_at"),
        supabase.from("predictions").select("match_id").eq("user_id", user!.id),
      ]);
      const total = matches?.length ?? 0;
      const finished = matches?.filter((m) => m.status === "finished").length ?? 0;
      const upcoming = matches?.filter((m) => new Date(m.kickoff_at) > new Date()).length ?? 0;
      return {
        points: lb?.total_points ?? 0,
        exact: lb?.exact_hits ?? 0,
        results: lb?.result_hits ?? 0,
        predictionsCount: preds?.length ?? 0,
        totalMatches: total,
        finishedMatches: finished,
        upcomingMatches: upcoming,
      };
    },
  });

  const { data: nextMatches } = useQuery({
    queryKey: ["dashboard-next-matches"],
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

      {/* Countdown next match */}
      {nextMatches && nextMatches[0] && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
          <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-1 flex items-center gap-1">
                <Radio className="h-3 w-3" /> Próximo partido
              </div>
              <div className="text-lg font-bold truncate flex items-center gap-2">
                <Flag name={nextMatches[0].team_a} size="md" />
                {nextMatches[0].team_a} vs {nextMatches[0].team_b}
                <Flag name={nextMatches[0].team_b} size="md" />
              </div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(nextMatches[0].kickoff_at), "EEEE dd MMM · HH:mm 'hs'", { locale: es })}
              </div>
            </div>
            <Countdown to={nextMatches[0].kickoff_at} />
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Trophy className="h-4 w-4" />} label="Mis puntos" value={stats?.points ?? 0} />
        <StatCard icon={<Target className="h-4 w-4" />} label="Plenos" value={stats?.exact ?? 0} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Aciertos resultado" value={stats?.results ?? 0} />
        <StatCard icon={<ListChecks className="h-4 w-4" />} label="Pronósticos" value={`${stats?.predictionsCount ?? 0}/${stats?.totalMatches ?? 0}`} />
      </div>

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
                    {format(new Date(m.kickoff_at), "EEE dd MMM · HH:mm", { locale: es })}
                    {m.group_name ? ` · Grupo ${m.group_name}` : ""}
                  </div>
                  <div className="font-medium text-sm truncate flex items-center gap-2">
                    <Flag name={m.team_a} size="sm" />
                    {m.team_a} vs {m.team_b}
                    <Flag name={m.team_b} size="sm" />
                  </div>
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
                  <div className="font-bold">{u.total_points} pts</div>
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
