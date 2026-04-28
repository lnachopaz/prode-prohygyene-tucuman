import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { format, isAfter, subHours } from "date-fns";
import { es } from "date-fns/locale";
import { getCountryFlagUrl } from "@/lib/countryFlags";
import { getUnlockTrigger } from "@/lib/unlock";
import { Countdown } from "@/components/Countdown";

type Match = {
  id: string;
  stage: string;
  group_name: string | null;
  team_a: string;
  team_b: string;
  team_a_flag: string | null;
  team_b_flag: string | null;
  kickoff_at: string;
  status: "scheduled" | "live" | "finished";
  score_a: number | null;
  score_b: number | null;
  venue: string | null;
};

type PredictionRow = {
  user_id: string;
  pred_a: number;
  pred_b: number;
  points: number;
  profiles?: { display_name: string; avatar_url: string | null } | null;
};

export default function MatchDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: match, isLoading: loadingMatch } = useQuery({
    queryKey: ["match", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as Match | null;
    },
  });

  const { data: allMatches } = useQuery({
    queryKey: ["matches-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("id, stage, group_name, kickoff_at");
      if (error) throw error;
      return data as { id: string; stage: string; group_name: string | null; kickoff_at: string }[];
    },
  });

  const unlockTrigger = useMemo(() => {
    if (!match || !allMatches) return null;
    return getUnlockTrigger(match, allMatches);
  }, [match, allMatches]);

  const roundOpen = !unlockTrigger || Date.now() >= unlockTrigger.unlocksAt.getTime();

  const locked = useMemo(() => {
    if (!match) return false;
    const lockAt = subHours(new Date(match.kickoff_at), 1);
    return !isAfter(lockAt, new Date()) || match.status !== "scheduled";
  }, [match]);

  const { data: predictions, isLoading: loadingPreds } = useQuery({
    queryKey: ["match-predictions", id, locked],
    enabled: !!id && locked,
    queryFn: async () => {
      const { data: preds, error } = await supabase
        .from("predictions")
        .select("user_id, pred_a, pred_b, points")
        .eq("match_id", id!)
        .order("points", { ascending: false });
      if (error) throw error;
      const userIds = Array.from(new Set((preds ?? []).map((p) => p.user_id)));
      let profilesMap = new Map<string, { display_name: string; avatar_url: string | null }>();
      if (userIds.length > 0) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, status")
          .in("id", userIds)
          .neq("status", "rejected");
        if (pErr) throw pErr;
        profs?.forEach((p) => profilesMap.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url }));
      }
      return (preds ?? [])
        .filter((p) => profilesMap.has(p.user_id))
        .map((p) => ({
          ...p,
          profiles: profilesMap.get(p.user_id) ?? null,
        })) as PredictionRow[];
    },
  });

  if (loadingMatch) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold mb-2">Partido no encontrado</h2>
        <Button variant="outline" onClick={() => navigate("/predictions")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver a Pronósticos
        </Button>
      </div>
    );
  }

  const teamAFlag = getCountryFlagUrl(match.team_a) ?? match.team_a_flag;
  const teamBFlag = getCountryFlagUrl(match.team_b) ?? match.team_b_flag;

  const statusBadge = () => {
    if (match.status === "live") return <Badge className="bg-destructive text-destructive-foreground">EN VIVO</Badge>;
    if (match.status === "finished") return <Badge variant="secondary">Finalizado</Badge>;
    if (locked) return <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Cerrado</Badge>;
    return <Badge variant="outline">Programado</Badge>;
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/predictions")}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Volver a Pronósticos
      </Button>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="font-medium">
              {match.stage}
              {match.group_name ? ` · ${match.group_name}` : ""}
            </span>
            {statusBadge()}
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="flex flex-col items-center gap-2">
              {teamAFlag ? (
                <img src={teamAFlag} alt={match.team_a} className="h-16 w-16 rounded-full object-cover bg-muted" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-muted" />
              )}
              <span className="font-semibold text-center">{match.team_a}</span>
            </div>
            <div className="text-center">
              {match.status !== "scheduled" && match.score_a !== null && match.score_b !== null ? (
                <div className="text-4xl font-bold">{match.score_a} - {match.score_b}</div>
              ) : (
                <div className="text-2xl font-bold text-muted-foreground">vs</div>
              )}
            </div>
            <div className="flex flex-col items-center gap-2">
              {teamBFlag ? (
                <img src={teamBFlag} alt={match.team_b} className="h-16 w-16 rounded-full object-cover bg-muted" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-muted" />
              )}
              <span className="font-semibold text-center">{match.team_b}</span>
            </div>
          </div>

          <div className="text-center text-sm text-muted-foreground space-y-1 pt-2 border-t">
            <div className="capitalize">
              {format(new Date(match.kickoff_at), "EEEE d 'de' MMMM yyyy 'a las' HH:mm", { locale: es })} hs
            </div>
            {match.venue && <div>{match.venue}</div>}
          </div>
        </CardContent>
      </Card>

      {!roundOpen && unlockTrigger && (
        <Card className="border-dashed">
          <CardContent className="p-4 space-y-2 text-center">
            <div className="flex items-center justify-center gap-2 text-sm">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                Esta ronda todavía no está disponible. Se desbloquea cuando arranque{" "}
                <strong className="text-foreground">{unlockTrigger.prevRoundLabel}</strong>.
              </span>
            </div>
            <div className="flex justify-center">
              <Countdown to={unlockTrigger.unlocksAt} />
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-xl font-bold mb-3">Pronósticos de los jugadores</h2>
        {!locked ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <Lock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Los pronósticos de los demás jugadores se mostrarán cuando el partido esté cerrado
              (1 hora antes del inicio).
            </CardContent>
          </Card>
        ) : loadingPreds ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !predictions || predictions.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Nadie cargó pronóstico para este partido.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {predictions.map((p) => (
              <Card key={p.user_id}>
                <CardContent className="p-3 flex items-center gap-3">
                  {p.profiles?.avatar_url ? (
                    <img src={p.profiles.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                      {p.profiles?.display_name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.profiles?.display_name ?? "Jugador"}</div>
                  </div>
                  <div className="text-lg font-bold tabular-nums">
                    {p.pred_a} - {p.pred_b}
                  </div>
                  {match.status === "finished" && (
                    <Badge
                      variant={p.points === 3 ? "default" : p.points === 1 ? "secondary" : "outline"}
                      className={p.points === 3 ? "bg-success text-success-foreground" : ""}
                    >
                      +{p.points}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
