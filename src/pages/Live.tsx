import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Radio, Clock, Trophy, Info } from "lucide-react";
import { formatAR } from "@/lib/datetime";
import { Countdown } from "@/components/Countdown";
import {
  useLiveMatches,
  LIVE_INTERVAL_MS,
  IDLE_INTERVAL_MS,
  MATCHES_STALE_TIME_MS,
} from "@/hooks/useLiveMatches";
import { useState } from "react";

export default function Live() {
  const { user } = useAuth();
  const [selectedIdx, setSelectedIdx] = useState(0);

  const { data: allMatches, isLoading } = useLiveMatches();

  // Derivar partidos en curso / próximo desde el cache (sin llamadas extra)
  const liveData = (() => {
    if (!allMatches) return null;
    const now = new Date();
    const ongoing = allMatches.filter(
      (m) => new Date(m.kickoff_at) <= now && m.status !== "finished",
    );
    if (ongoing.length > 0) return { matches: ongoing, isLive: true };
    const next = allMatches.find(
      (m) => new Date(m.kickoff_at) > now && m.status !== "finished",
    );
    return next ? { matches: [next], isLive: false } : null;
  })();

  const matches = liveData?.matches ?? [];
  const safeIdx = Math.min(selectedIdx, Math.max(0, matches.length - 1));
  const current = liveData ? { match: matches[safeIdx], isLive: liveData.isLive } : null;

  const matchId = current?.match?.id;
  const kickoff = current ? new Date(current.match.kickoff_at) : null;
  const predsLocked = kickoff ? (kickoff.getTime() - 60 * 60 * 1000) <= Date.now() : false;
  const isFinished = current?.match?.status === "finished";
  const secondaryInterval = current?.isLive ? LIVE_INTERVAL_MS : IDLE_INTERVAL_MS;

  const { data: predictions } = useQuery({
    queryKey: ["live-predictions", matchId, predsLocked],
    enabled: !!matchId && predsLocked,
    staleTime: MATCHES_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchInterval: secondaryInterval,
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
      return preds
        .map((p) => ({
          ...p,
          display_name: profiles?.find((pr) => pr.id === p.user_id)?.display_name ?? "—",
        }))
        .sort((a, b) => {
          // Orden alfabético si no hay puntos aún; por puntos si finalizó
          if (isFinished) return (b.points ?? 0) - (a.points ?? 0);
          return a.display_name.localeCompare(b.display_name);
        });
    },
  });

  const { data: myPred } = useQuery({
    queryKey: ["live-my-pred", matchId, user?.id],
    enabled: !!matchId && !!user,
    staleTime: MATCHES_STALE_TIME_MS,
    refetchOnWindowFocus: false,
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

  if (!current) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">En juego</h1>
        <Card><CardContent className="p-8 text-center text-muted-foreground">No hay partidos próximos.</CardContent></Card>
      </div>
    );
  }

  const m = current.match;
  const started = current.isLive;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Radio className="h-7 w-7 text-primary" /> En juego
        </h1>
        <p className="text-muted-foreground">Seguí los partidos y los pronósticos del grupo.</p>
      </div>

      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4" />
        <AlertDescription>
          Los marcadores se actualizan <strong>al finalizar cada partido</strong>. Los pronósticos del grupo se muestran una vez cerrada la ventana (1 hora antes del inicio).
        </AlertDescription>
      </Alert>

      {/* Selector cuando hay varios partidos en curso */}
      {matches.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {matches.map((mt, i) => (
            <Button
              key={mt.id}
              variant={i === safeIdx ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedIdx(i)}
              className="gap-2"
            >
              {current.isLive && <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />}
              <span>{mt.team_a} vs {mt.team_b}</span>
            </Button>
          ))}
        </div>
      )}

      {/* Match card */}
      <Card className="border-primary/30 overflow-hidden">
        <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 ${started ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>
          {started ? (
            <><span className="h-2 w-2 rounded-full bg-current animate-pulse" /> En juego</>
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
              {isFinished ? (
                <div className="text-4xl md:text-5xl font-bold tabular-nums">
                  {m.score_a ?? 0} <span className="text-muted-foreground">-</span> {m.score_b ?? 0}
                </div>
              ) : started ? (
                <div className="text-2xl font-bold text-muted-foreground">
                  - <span className="mx-1">vs</span> -
                </div>
              ) : (
                <div className="text-2xl font-bold text-muted-foreground">vs</div>
              )}
              <div className="text-xs text-muted-foreground mt-1">
                {formatAR(m.kickoff_at, "dd MMM · HH:mm 'hs'")}
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

          {started && !isFinished && (
            <div className="mt-6 rounded-md border bg-muted/40 p-3 text-sm text-center text-muted-foreground italic">
              El resultado se mostrará al finalizar el partido.
            </div>
          )}

          {/* Mi pronóstico */}
          {predsLocked && (
            <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">
              {myPred ? (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-muted-foreground">
                    Tu pronóstico: <strong className="text-foreground tabular-nums">{myPred.pred_a} - {myPred.pred_b}</strong>
                  </span>
                  {isFinished && (
                    <span>
                      <span className="text-muted-foreground mr-2">Final:</span>
                      {(myPred.points ?? 0) === 3 ? <Badge className="bg-success text-success-foreground">+3 pts</Badge>
                        : (myPred.points ?? 0) >= 1 ? <Badge variant="secondary">+{myPred.points} pt{(myPred.points ?? 0) > 1 ? "s" : ""}</Badge>
                        : <Badge variant="outline">0 pts</Badge>}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-center">No pronosticaste este partido.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pronósticos del grupo */}
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
              {predictions.map((p) => (
                <div key={p.user_id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="font-medium truncate">{p.display_name}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold tabular-nums">{p.pred_a} - {p.pred_b}</span>
                    {isFinished ? (
                      (p.points ?? 0) === 3 ? <Badge className="bg-success text-success-foreground">+3</Badge>
                      : (p.points ?? 0) >= 1 ? <Badge variant="secondary">+{p.points}</Badge>
                      : <Badge variant="outline">0</Badge>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
