import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Lock } from "lucide-react";
import { toast } from "sonner";
import { isAfter, subMinutes } from "date-fns";
import { getCountryFlagUrl } from "@/lib/countryFlags";
import { formatLocalTime, localDateKey, formatLocalDateHeading } from "@/lib/matchTime";

type Match = {
  id: string;
  stage: string;
  group_name: string | null;
  team_a: string;
  team_b: string;
  team_a_flag: string | null;
  team_b_flag: string | null;
  kickoff_at: string;
  venue: string | null;
  venue_tz: string | null;
  status: "scheduled" | "live" | "finished";
  score_a: number | null;
  score_b: number | null;
};

type Prediction = {
  match_id: string;
  pred_a: number;
  pred_b: number;
  points: number;
};

export default function Predictions() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: matches, isLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .order("kickoff_at", { ascending: true });
      if (error) throw error;
      return data as Match[];
    },
  });

  const { data: preds } = useQuery({
    queryKey: ["my-preds", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("match_id, pred_a, pred_b, points")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data as Prediction[];
    },
  });

  const predMap = useMemo(() => {
    const m = new Map<string, Prediction>();
    preds?.forEach((p) => m.set(p.match_id, p));
    return m;
  }, [preds]);

  const grouped = useMemo(() => {
    if (!matches) return [];
    const byDate = new Map<string, Match[]>();
    matches.forEach((m) => {
      const key = localDateKey(m.kickoff_at, m.venue_tz);
      const arr = byDate.get(key) ?? [];
      arr.push(m);
      byDate.set(key, arr);
    });
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [matches]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!matches || matches.length === 0) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold mb-2">Aún no hay partidos cargados</h2>
        <p className="text-muted-foreground">El admin debe sincronizar el fixture del Mundial 2026.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Pronósticos</h1>
        <p className="text-muted-foreground">Cargá tus marcadores antes del cierre (5 min antes del partido).</p>
      </div>

      {grouped.map(([date, dayMatches]) => (
        <section key={date} className="space-y-3">
          <h2 className="text-lg font-semibold capitalize text-muted-foreground">
            {formatLocalDateHeading(dayMatches[0].kickoff_at, dayMatches[0].venue_tz)}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {dayMatches.map((m) => {
              const matchWithFlags = {
                ...m,
                team_a_flag: getCountryFlagUrl(m.team_a) ?? m.team_a_flag,
                team_b_flag: getCountryFlagUrl(m.team_b) ?? m.team_b_flag,
              };
              return (
                <MatchCard
                  key={m.id}
                  match={matchWithFlags}
                  prediction={predMap.get(m.id)}
                  onSaved={() => qc.invalidateQueries({ queryKey: ["my-preds"] })}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function MatchCard({
  match,
  prediction,
  onSaved,
}: {
  match: Match;
  prediction?: Prediction;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const lockAt = subMinutes(new Date(match.kickoff_at), 5);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const locked = !isAfter(lockAt, now) || match.status !== "scheduled";

  const [a, setA] = useState<string>(prediction?.pred_a?.toString() ?? "");
  const [b, setB] = useState<string>(prediction?.pred_b?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (prediction) {
      setA(prediction.pred_a.toString());
      setB(prediction.pred_b.toString());
    }
  }, [prediction]);

  async function handleSave() {
    if (!user) return;
    const pa = parseInt(a, 10);
    const pb = parseInt(b, 10);
    if (isNaN(pa) || isNaN(pb) || pa < 0 || pb < 0) {
      return toast.error("Ingresá goles válidos");
    }
    setSaving(true);
    const { error } = await supabase
      .from("predictions")
      .upsert(
        { user_id: user.id, match_id: match.id, pred_a: pa, pred_b: pb },
        { onConflict: "user_id,match_id" },
      );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Pronóstico guardado");
    onSaved();
  }

  const statusBadge = () => {
    if (match.status === "live") return <Badge className="bg-destructive text-destructive-foreground">EN VIVO</Badge>;
    if (match.status === "finished") return <Badge variant="secondary">Finalizado</Badge>;
    if (locked) return <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Cerrado</Badge>;
    return <Badge variant="outline">{format(new Date(match.kickoff_at), "HH:mm")}</Badge>;
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium">
            {match.stage}
            {match.group_name ? ` · ${match.group_name}` : ""}
          </span>
          {statusBadge()}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamSide name={match.team_a} flag={match.team_a_flag} align="end" />
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              className="w-14 text-center text-lg font-bold"
              value={a}
              disabled={locked}
              onChange={(e) => setA(e.target.value)}
            />
            <span className="text-muted-foreground font-bold">vs</span>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              className="w-14 text-center text-lg font-bold"
              value={b}
              disabled={locked}
              onChange={(e) => setB(e.target.value)}
            />
          </div>
          <TeamSide name={match.team_b} flag={match.team_b_flag} align="start" />
        </div>

        {match.status === "finished" && (
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Resultado: <strong className="text-foreground">{match.score_a} - {match.score_b}</strong>
            </span>
            <span className="font-bold">
              {prediction ? (
                <span className={
                  prediction.points === 3 ? "text-success" :
                  prediction.points === 1 ? "text-warning" : "text-muted-foreground"
                }>
                  +{prediction.points} pts
                </span>
              ) : (
                <span className="text-muted-foreground">Sin pronóstico</span>
              )}
            </span>
          </div>
        )}

        {!locked && (
          <Button size="sm" className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Guardar pronóstico
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function TeamSide({ name, flag, align }: { name: string; flag: string | null; align: "start" | "end" }) {
  return (
    <div className={`flex items-center gap-2 min-w-0 ${align === "end" ? "justify-end" : "justify-start"}`}>
      {align === "end" && <span className="font-semibold truncate">{name}</span>}
      {flag ? (
        <img src={flag} alt={name} className="h-7 w-7 rounded-full object-cover bg-muted flex-shrink-0" />
      ) : (
        <div className="h-7 w-7 rounded-full bg-muted flex-shrink-0" />
      )}
      {align === "start" && <span className="font-semibold truncate">{name}</span>}
    </div>
  );
}
