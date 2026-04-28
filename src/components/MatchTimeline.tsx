import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Goal, Square } from "lucide-react";

interface MatchTimelineProps {
  matchId: string;
  teamA: string;
  teamB: string;
}

interface MatchEvent {
  id: string;
  minute: number;
  type: "goal" | "yellow_card" | "red_card" | "substitution";
  team: "home" | "away";
  player: string | null;
  score_home: number | null;
  score_away: number | null;
}

export function MatchTimeline({ matchId, teamA, teamB }: MatchTimelineProps) {
  const qc = useQueryClient();

  const { data: events, isLoading } = useQuery({
    queryKey: ["match-events", matchId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("match_events")
        .select("*")
        .eq("match_id", matchId)
        .order("minute", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MatchEvent[];
    },
  });

  // Realtime: refrescar al instante cuando llega un nuevo evento
  useEffect(() => {
    const channel = supabase
      .channel(`match-events-${matchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_events", filter: `match_id=eq.${matchId}` },
        () => qc.invalidateQueries({ queryKey: ["match-events", matchId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, qc]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" /> Eventos del partido
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando eventos…</p>
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin eventos todavía.</p>
        ) : (
          <ol className="space-y-2">
            {events.map((e) => {
              const teamName = e.team === "home" ? teamA : teamB;
              const isGoal = e.type === "goal";
              const isYellow = e.type === "yellow_card";
              const isRed = e.type === "red_card";
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-3 py-2 border-b last:border-0"
                >
                  <span className="w-10 text-xs font-bold tabular-nums text-muted-foreground">
                    {e.minute}'
                  </span>
                  <span className="flex items-center justify-center w-6 shrink-0">
                    {isGoal && <Goal className="h-4 w-4 text-success" />}
                    {isYellow && <Square className="h-3 w-3 fill-yellow-400 text-yellow-400" />}
                    {isRed && <Square className="h-3 w-3 fill-destructive text-destructive" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {e.player ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {teamName}
                    </div>
                  </div>
                  {isGoal && e.score_home !== null && e.score_away !== null && (
                    <span className="text-sm font-bold tabular-nums">
                      {e.score_home} - {e.score_away}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
