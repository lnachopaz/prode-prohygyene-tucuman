import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Lock, Trophy } from "lucide-react";
import { format, isAfter, subHours } from "date-fns";
import { es } from "date-fns/locale";
import { getCountryFlagUrl } from "@/lib/countryFlags";
import { cn } from "@/lib/utils";

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
};

type PredictionRow = {
  user_id: string;
  pred_a: number;
  pred_b: number;
  points: number;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
};

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

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

  const lockAt = match ? subHours(new Date(match.kickoff_at), 1) : null;
  const locked = match
    ? !isAfter(lockAt!, new Date()) || match.status !== "scheduled"
    : false;

  const { data: preds, isLoading: loadingPreds } = useQuery({
    queryKey: ["match-preds", id],
    enabled: !!id && !!match,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("user_id, pred_a, pred_b, points, profiles(display_name, avatar_url)")
        .eq("match_id", id!);
      if (error) throw error;
      return (data ?? []) as unknown as PredictionRow[];
    },
  });

  const sorted = useMemo(() => {
    if (!preds) return [];
    return [...preds].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const an = a.profiles?.display_name ?? "";
      const bn = b.profiles?.display_name ?? "";
      return an.localeCompare(bn);
    });
  }, [preds]);

  if (loadingMatch) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="text-center py-20 space-y-4">
        <h2 className="text-xl font-bold">Partido no encontrado</h2>
        <Button asChild variant="outline">
          <Link to="/predictions"><ArrowLeft className="h-4 w-4 mr-2" /> Volver</Link>
        </Button>
      </div>
    );
  }

  const flagA = getCountryFlagUrl(match.team_a) ?? match.team_a_flag;
  const flagB = getCountryFlagUrl(match.team_b) ?? match.team_b_flag;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/predictions"><ArrowLeft className="h-4 w-4 mr-2" /> Volver a pronósticos</Link>
      </Button>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="font-medium">
              {match.stage}
              {match.group_name ? ` · ${match.group_name}` : ""}
            </span>
            {match.status === "live" ? (
              <Badge className="bg-destructive text-destructive-foreground">EN VIVO</Badge>
            ) : match.status === "finished" ? (
              <Badge variant="secondary">Finalizado</Badge>
            ) : locked ? (
              <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Cerrado</Badge>
            ) : (
              <Badge variant="outline">
                {format(new Date(match.kickoff_at), "EEE d MMM · HH:mm", { locale: es })}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="flex items-center gap-3 justify-end min-w-0">
              <span className="font-bold truncate text-right">{match.team_a}</span>
              {flagA ? (
                <img src={flagA} alt={match.team_a} className="h-10 w-10 rounded-full object-cover bg-muted" />
              ) : <div className="h-10 w-10 rounded-full bg-muted" />}
            </div>
            <div className="text-3xl font-extrabold tabular-nums">
              {match.status === "scheduled"
                ? "vs"
                : `${match.score_a ?? 0} - ${match.score_b ?? 0}`}
            </div>
            <div className="flex items-center gap-3 justify-start min-w-0">
              {flagB ? (
                <img src={flagB} alt={match.team_b} className="h-10 w-10 rounded-full object-cover bg-muted" />
              ) : <div className="h-10 w-10 rounded-full bg-muted" />}
              <span className="font-bold truncate">{match.team_b}</span>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            {format(new Date(match.kickoff_at), "EEEE d 'de' MMMM yyyy · HH:mm 'hs'", { locale: es })}
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-bold flex items-center gap-2 mb-3">
          <Trophy className="h-5 w-5 text-primary" /> Pronósticos de los jugadores
        </h2>

        {!locked ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground text-sm">
              <Lock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Los pronósticos se mostrarán cuando el partido cierre (1 hora antes del inicio).
            </CardContent>
          </Card>
        ) : loadingPreds ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : sorted.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground text-sm">
              Nadie cargó un pronóstico para este partido.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                <div className="grid grid-cols-[1fr_80px_70px] gap-3 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                  <span>Jugador</span>
                  <span className="text-center">Pronóstico</span>
                  <span className="text-right">Puntos</span>
                </div>
                {sorted.map((p) => {
                  const isMe = p.user_id === user?.id;
                  return (
                    <div
                      key={p.user_id}
                      className={cn(
                        "grid grid-cols-[1fr_80px_70px] gap-3 px-4 py-3 items-center text-sm",
                        isMe && "bg-primary/5",
                      )}
                    >
                      <span className="font-medium truncate flex items-center gap-2">
                        {p.profiles?.display_name ?? "Jugador"}
                        {isMe && <span className="text-xs text-primary">(vos)</span>}
                      </span>
                      <span className="text-center font-bold tabular-nums">
                        {p.pred_a} - {p.pred_b}
                      </span>
                      <span className={cn(
                        "text-right font-bold tabular-nums",
                        match.status === "finished" && p.points === 3 && "text-success",
                        match.status === "finished" && p.points === 1 && "text-warning",
                        match.status === "finished" && p.points === 0 && "text-muted-foreground",
                      )}>
                        {match.status === "finished" ? `+${p.points}` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
