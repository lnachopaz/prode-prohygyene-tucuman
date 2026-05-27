import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, Lock, X, Pencil, Sparkles, Calendar, ChevronUp, ChevronDown, LayoutGrid } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchDetailsDialog } from "@/components/MatchDetailsDialog";
import { toast } from "sonner";
import { format, isAfter, subHours, formatDistanceStrict } from "date-fns";
import { es } from "date-fns/locale";
import { getCountryFlagUrl } from "@/lib/countryFlags";
import { getClubCrestUrl } from "@/lib/clubCrests";
import { formatAR } from "@/lib/datetime";
import { getMultiplierInfo, formatPoints, formatMultiplier } from "@/lib/scoring";
import { translateTeamName, isArgentina, isArgentinaMatch } from "@/lib/teamNames";
import { formatGroupName } from "@/lib/groupNames";
import { useLockState } from "@/hooks/useLockState";

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
  predictions_lock_mode?: "auto" | "force_open" | "force_closed";
  prediction_window_id: string | null;
  venue?: string | null;
  point_multiplier?: number | null;
  team_a_multiplier?: number | null;
  team_b_multiplier?: number | null;
};

type PredictionWindow = {
  id: string;
  label: string;
  opens_at: string;
  closes_at: string;
  sort_order: number;
};

type Prediction = {
  match_id: string;
  pred_a: number;
  pred_b: number;
  points: number | string;
};

type TeamStat = {
  team: string;
  flag: string | null;
  pj: number;
  g: number;
  e: number;
  p: number;
  gf: number;
  gc: number;
  pts: number;
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

  const { data: windows } = useQuery({
    queryKey: ["prediction-windows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prediction_windows")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as PredictionWindow[];
    },
  });

  const windowMap = useMemo(() => {
    const m = new Map<string, PredictionWindow>();
    windows?.forEach((w) => m.set(w.id, w));
    return m;
  }, [windows]);

  const predMap = useMemo(() => {
    const m = new Map<string, Prediction>();
    preds?.forEach((p) => m.set(p.match_id, p));
    return m;
  }, [preds]);

  const groupStandings = useMemo(() => {
    if (!matches) return new Map<string, TeamStat[]>();
    const groupMatches = matches.filter((m) => m.group_name !== null);
    const groups = new Map<string, Map<string, TeamStat>>();
    groupMatches.forEach((m) => {
      if (!m.group_name) return;
      if (!groups.has(m.group_name)) groups.set(m.group_name, new Map());
      const g = groups.get(m.group_name)!;
      if (!g.has(m.team_a)) g.set(m.team_a, { team: m.team_a, flag: m.team_a_flag, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0 });
      if (!g.has(m.team_b)) g.set(m.team_b, { team: m.team_b, flag: m.team_b_flag, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0 });
    });
    groupMatches.forEach((m) => {
      const pred = predMap.get(m.id);
      if (!pred) return;
      const g = groups.get(m.group_name!)!;
      const a = g.get(m.team_a)!;
      const b = g.get(m.team_b)!;
      a.pj++; b.pj++;
      a.gf += pred.pred_a; a.gc += pred.pred_b;
      b.gf += pred.pred_b; b.gc += pred.pred_a;
      if (pred.pred_a > pred.pred_b) { a.g++; a.pts += 3; b.p++; }
      else if (pred.pred_a < pred.pred_b) { b.g++; b.pts += 3; a.p++; }
      else { a.e++; a.pts++; b.e++; b.pts++; }
    });
    const result = new Map<string, TeamStat[]>();
    groups.forEach((teamMap, groupName) => {
      const teams = Array.from(teamMap.values()).sort((x, y) => {
        if (y.pts !== x.pts) return y.pts - x.pts;
        const dx = x.gf - x.gc, dy = y.gf - y.gc;
        if (dy !== dx) return dy - dx;
        if (y.gf !== x.gf) return y.gf - x.gf;
        return x.team.localeCompare(y.team);
      });
      result.set(groupName, teams);
    });
    return result;
  }, [matches, predMap]);

  const [stageFilter, setStageFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [predStatusFilter, setPredStatusFilter] = useState<string>("all");

  const stages = useMemo(() => {
    const s = new Set<string>();
    matches?.forEach((m) => s.add(m.stage));
    return Array.from(s);
  }, [matches]);

  const groups = useMemo(() => {
    const s = new Set<string>();
    matches?.forEach((m) => m.group_name && s.add(m.group_name));
    return Array.from(s).sort();
  }, [matches]);

  const filtered = useMemo(() => {
    if (!matches) return [];
    const now = new Date();
    const term = teamFilter.trim().toLowerCase();
    return matches.filter((m) => {
      if (stageFilter !== "all" && m.stage !== stageFilter) return false;
      if (groupFilter !== "all" && m.group_name !== groupFilter) return false;
      if (term && !m.team_a.toLowerCase().includes(term) && !m.team_b.toLowerCase().includes(term) && !translateTeamName(m.team_a).toLowerCase().includes(term) && !translateTeamName(m.team_b).toLowerCase().includes(term)) return false;
      if (predStatusFilter !== "all") {
        const p = predMap.get(m.id);
        const lockAt = subHours(new Date(m.kickoff_at), 1);
        const mode = m.predictions_lock_mode ?? "auto";
        const timeLocked = !isAfter(lockAt, now) || m.status !== "scheduled";
        const locked = mode === "force_closed" || (mode === "auto" && timeLocked);
        if (predStatusFilter === "loaded" && !p) return false;
        if (predStatusFilter === "missing" && p) return false;
        if (predStatusFilter === "open" && locked) return false;
        if (predStatusFilter === "locked" && !locked) return false;
        if (predStatusFilter === "finished" && m.status !== "finished") return false;
      }
      return true;
    });
  }, [matches, stageFilter, groupFilter, teamFilter, predStatusFilter, predMap]);

  const grouped = useMemo(() => {
    const byDate = new Map<string, Match[]>();
    // Agrupamos por fecha en horario Argentina para evitar desfasajes según la zona del navegador
    const fmtKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    filtered.forEach((m) => {
      const key = fmtKey.format(new Date(m.kickoff_at)); // YYYY-MM-DD en AR
      const arr = byDate.get(key) ?? [];
      arr.push(m);
      byDate.set(key, arr);
    });
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const hasActiveFilters =
    stageFilter !== "all" || groupFilter !== "all" || teamFilter !== "" || predStatusFilter !== "all";

  function clearFilters() {
    setStageFilter("all");
    setGroupFilter("all");
    setTeamFilter("");
    setPredStatusFilter("all");
  }

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pronósticos</h1>
        <p className="text-muted-foreground">Cargá tus marcadores hasta 1 hora antes de cada partido.</p>
      </div>

      <Tabs defaultValue="predictions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="predictions">Pronósticos</TabsTrigger>
          <TabsTrigger value="standings" className="gap-1.5">
            <LayoutGrid className="h-4 w-4" /> Tabla de Grupos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="predictions" className="space-y-6 mt-0">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Etapa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las etapas</SelectItem>
                {stages.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los grupos</SelectItem>
                {groups.map((g) => <SelectItem key={g} value={g}>{formatGroupName(g)}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={predStatusFilter} onValueChange={setPredStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="loaded">Pronóstico cargado</SelectItem>
                <SelectItem value="missing">Sin pronóstico</SelectItem>
                <SelectItem value="open">Abiertos</SelectItem>
                <SelectItem value="locked">Cerrados</SelectItem>
                <SelectItem value="finished">Finalizados</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Buscar equipo..."
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="w-[200px]"
            />

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" /> Limpiar
              </Button>
            )}

            <span className="text-sm text-muted-foreground ml-auto">
              {filtered.length} {filtered.length === 1 ? "partido" : "partidos"}
            </span>
          </div>

          {grouped.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No hay partidos que coincidan con los filtros.
            </div>
          ) : (
            grouped.map(([date, dayMatches]) => (
              <section key={date} className="space-y-3">
                <h2 className="text-lg font-semibold capitalize text-muted-foreground">
                  {(() => {
                    const [y, mo, d] = date.split("-").map(Number);
                    return format(new Date(y, mo - 1, d, 12), "EEEE d 'de' MMMM yyyy", { locale: es });
                  })()}
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {dayMatches.map((m) => {
                    const matchWithFlags = {
                      ...m,
                      team_a_flag: getCountryFlagUrl(m.team_a) ?? getClubCrestUrl(m.team_a) ?? m.team_a_flag,
                      team_b_flag: getCountryFlagUrl(m.team_b) ?? getClubCrestUrl(m.team_b) ?? m.team_b_flag,
                    };
                    return (
                      <MatchCard
                        key={m.id}
                        match={matchWithFlags}
                        window={m.prediction_window_id ? windowMap.get(m.prediction_window_id) : undefined}
                        prediction={predMap.get(m.id)}
                        onSaved={() => qc.invalidateQueries({ queryKey: ["my-preds"] })}
                      />
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </TabsContent>

        <TabsContent value="standings" className="mt-0">
          <GroupStandingsSection standings={groupStandings} matches={matches ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GroupStandingsSection({
  standings,
  matches,
}: {
  standings: Map<string, TeamStat[]>;
  matches: Match[];
}) {
  const sortedGroups = Array.from(standings.keys()).sort();

  const totalByGroup = useMemo(() => {
    const counts = new Map<string, number>();
    matches.filter((m) => m.group_name).forEach((m) => {
      counts.set(m.group_name!, (counts.get(m.group_name!) ?? 0) + 1);
    });
    return counts;
  }, [matches]);

  if (sortedGroups.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">
        No hay partidos de grupos disponibles aún.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Posiciones calculadas según tus pronósticos. Solo se cuentan los partidos donde ya cargaste un resultado.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sortedGroups.map((groupName) => {
          const teams = standings.get(groupName)!;
          const total = totalByGroup.get(groupName) ?? 0;
          const predicted = Math.round(teams.reduce((s, t) => s + t.pj, 0) / 2);
          return (
            <Card key={groupName} className="overflow-hidden">
              <div className="bg-primary/10 px-3 py-2 flex items-center justify-between border-b">
                <span className="font-bold text-sm text-primary">{formatGroupName(groupName)}</span>
                <span className="text-[11px] text-muted-foreground">{predicted}/{total} pred.</span>
              </div>
              <CardContent className="p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-muted-foreground border-b">
                      <th className="py-1.5 pl-3 text-left w-5">#</th>
                      <th className="py-1.5 pl-1.5 text-left">Equipo</th>
                      <th className="py-1.5 text-center w-7">PJ</th>
                      <th className="py-1.5 text-center w-6">G</th>
                      <th className="py-1.5 text-center w-6">E</th>
                      <th className="py-1.5 text-center w-6">P</th>
                      <th className="py-1.5 text-center w-9">DIF</th>
                      <th className="py-1.5 pr-3 text-center w-8 font-bold text-foreground">PTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((team, idx) => {
                      const flag = getCountryFlagUrl(team.team) ?? getClubCrestUrl(team.team) ?? team.flag;
                      const dif = team.gf - team.gc;
                      const isArg = isArgentina(translateTeamName(team.team));
                      return (
                        <tr
                          key={team.team}
                          className={[
                            "border-b last:border-0",
                            idx < 2 ? "bg-primary/5" : "",
                            isArg ? "bg-amber-50 dark:bg-amber-950/20" : "",
                          ].filter(Boolean).join(" ")}
                        >
                          <td className="py-1.5 pl-3 text-muted-foreground font-semibold">{idx + 1}</td>
                          <td className="py-1.5 pl-1.5">
                            <div className="flex items-center gap-1.5">
                              {flag ? (
                                <img src={flag} alt={team.team} className="h-4 w-4 rounded-full object-cover ring-1 ring-border shrink-0" />
                              ) : (
                                <div className="h-4 w-4 rounded-full bg-muted ring-1 ring-border shrink-0" />
                              )}
                              <span className={`truncate max-w-[70px] font-medium ${isArg ? "text-argentina" : ""}`}>
                                {translateTeamName(team.team)}
                              </span>
                            </div>
                          </td>
                          <td className="py-1.5 text-center text-muted-foreground">{team.pj}</td>
                          <td className="py-1.5 text-center text-muted-foreground">{team.g}</td>
                          <td className="py-1.5 text-center text-muted-foreground">{team.e}</td>
                          <td className="py-1.5 text-center text-muted-foreground">{team.p}</td>
                          <td className={`py-1.5 text-center font-medium ${dif > 0 ? "text-green-600 dark:text-green-400" : dif < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                            {dif > 0 ? `+${dif}` : dif}
                          </td>
                          <td className="py-1.5 pr-3 text-center font-bold">{team.pts}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function MatchCard({
  match,
  window: predWindow,
  prediction,
  onSaved,
}: {
  match: Match;
  window?: PredictionWindow;
  prediction?: Prediction;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const {
    now,
    lockAt,
    closesAt,
    liveByTime,
    lockedByAdmin,
    windowNotYetOpen,
    locked,
    closedByTime,
  } = useLockState(match, predWindow);

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

  const multInfo = getMultiplierInfo(match.team_a, match.team_b, match.stage, match.point_multiplier, match.team_a_multiplier, match.team_b_multiplier);
  const arg = isArgentinaMatch(match.team_a, match.team_b);
  const closesInText = !locked && match.status === "scheduled"
    ? formatDistanceStrict(closesAt, now, { locale: es })
    : null;

  function bump(setter: (v: string) => void, current: string, delta: number) {
    const n = Math.max(0, (parseInt(current, 10) || 0) + delta);
    setter(String(n));
  }

  // Diseño tipo "tarjeta de pronóstico" (referencia foto del usuario)
  const isLive = match.status === "live" || liveByTime;
  const isClosedScheduled = match.status === "scheduled" && locked;
  const liveBorder = isLive ? "border-2 border-destructive shadow-[0_0_0_3px_hsl(var(--destructive)/0.25)]" : "";


  if (match.status === "scheduled" && !locked) {
    return (
      <Card className={`overflow-hidden relative ${arg ? "border-argentina border-2 shadow-md" : ""}`}>
        <CardContent className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-muted-foreground truncate">
                {match.stage}{match.group_name ? ` · ${formatGroupName(match.group_name)}` : ""}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <Calendar className="h-3.5 w-3.5" />
                <span className="capitalize">{formatAR(match.kickoff_at, "EEE dd/MM")}</span>
                <span>·</span>
                <span className="font-semibold tabular-nums">{formatAR(match.kickoff_at, "HH:mm 'hs'")}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {multInfo && (
                <Badge className="gap-1 bg-amber-500 hover:bg-amber-500 text-white">
                  <Sparkles className="h-3 w-3" />{multInfo.label}
                </Badge>
              )}
              <Badge variant="outline" className="rounded-full px-3 font-semibold tabular-nums">
                {formatAR(match.kickoff_at, "HH:mm 'hs'")}
              </Badge>
          </div>
          </div>

          {/* Equipos + inputs con flechas */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2 sm:gap-3 py-1">
            <TeamBig name={translateTeamName(match.team_a)} flag={match.team_a_flag} />

            <ScoreStepper
              value={a}
              disabled={locked}
              onUp={() => bump(setA, a, 1)}
              onDown={() => bump(setA, a, -1)}
              onChange={setA}
              ariaLabel={`Goles ${translateTeamName(match.team_a)}`}
            />

            <span className="text-sm font-semibold text-muted-foreground px-1">vs</span>

            <ScoreStepper
              value={b}
              disabled={locked}
              onUp={() => bump(setB, b, 1)}
              onDown={() => bump(setB, b, -1)}
              onChange={setB}
              ariaLabel={`Goles ${translateTeamName(match.team_b)}`}
            />

            <TeamBig name={translateTeamName(match.team_b)} flag={match.team_b_flag} reverse />
          </div>

          {/* Estado / cierre */}
          <div className="text-sm">
            {lockedByAdmin ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Bloqueado por admin</span>
            ) : windowNotYetOpen && predWindow ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Abre {formatAR(predWindow.opens_at, "dd/MM HH:mm")}</span>
            ) : locked ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Cerrado</span>
            ) : (
              <span className="text-muted-foreground">
                Cierra en <strong className="text-foreground">{closesInText}</strong>
              </span>
            )}
          </div>

          {/* Botón */}
          {!locked && (
            <Button
              size="lg"
              className={prediction
                ? "w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold"
                : "w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"}
              onClick={handleSave}
              disabled={saving || windowNotYetOpen}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {prediction ? "Editar pronóstico" : "Guardar pronóstico"}
            </Button>
          )}

          {match.venue && (
            <div className="text-xs text-muted-foreground text-center">📍 {match.venue}</div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Partido en vivo o finalizado: layout previo (con marcador grande)
  return (
    <Card className={`overflow-hidden relative ${liveBorder} ${arg && !isLive ? "border-argentina border-2 shadow-md" : ""}`}>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between text-xs gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-muted-foreground truncate">
              {match.stage}{match.group_name ? ` · ${formatGroupName(match.group_name)}` : ""}
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground mt-1">
              <Calendar className="h-3.5 w-3.5" />
              <span className="capitalize">{formatAR(match.kickoff_at, "EEE dd/MM")}</span>
              <span>·</span>
              <span className="font-semibold tabular-nums">{formatAR(match.kickoff_at, "HH:mm 'hs'")}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {multInfo && (
              <Badge className="gap-1 bg-amber-500 hover:bg-amber-500 text-white">
                <Sparkles className="h-3 w-3" />{multInfo.label}
              </Badge>
            )}
            {match.status === "finished"
              ? <Badge variant="secondary">Finalizado</Badge>
              : isLive
              ? <Badge className="bg-destructive text-destructive-foreground animate-pulse">🔴 En Juego</Badge>
              : windowNotYetOpen && predWindow
              ? <Badge variant="outline" className="border-muted-foreground/40"><Calendar className="h-3 w-3 mr-1" />Abre {formatAR(predWindow.opens_at, "dd/MM HH:mm")}</Badge>
              : <Badge variant="outline" className="border-muted-foreground/40"><Lock className="h-3 w-3 mr-1" />Cerrado</Badge>}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <TeamBig name={translateTeamName(match.team_a)} flag={match.team_a_flag} />
          <div className="flex flex-col items-center justify-center px-1 min-w-[80px]">
            {match.status === "finished" ? (
              <div className="flex items-center gap-1.5">
                <span className="text-3xl font-extrabold tabular-nums">{match.score_a ?? 0}</span>
                <span className="text-2xl text-muted-foreground font-bold">-</span>
                <span className="text-3xl font-extrabold tabular-nums">{match.score_b ?? 0}</span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center font-semibold">
                {isLive ? "Resultado al final" : "vs"}
              </div>
            )}
            {isLive && (
              <div className="flex items-center gap-1 mt-1">
                <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                <span className="text-[10px] font-bold text-destructive uppercase">En Juego</span>
              </div>
            )}
          </div>
          <TeamBig name={translateTeamName(match.team_b)} flag={match.team_b_flag} reverse />
        </div>

        {/* Pronóstico propio (visible siempre que esté cargado) */}
        {prediction && (
          <div className="rounded-md bg-muted px-3 py-2 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Tu pronóstico</span>
              <span className="font-mono font-semibold">{prediction.pred_a} - {prediction.pred_b}</span>
            </div>
            {match.status === "finished" && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Puntos obtenidos</span>
                <span className={
                  Number(prediction.points) > 1 ? "text-success font-bold" :
                  Number(prediction.points) > 0 ? "text-warning font-bold" : "text-muted-foreground font-bold"
                }>
                  +{formatPoints(prediction.points)} pts
                </span>
              </div>
            )}
          </div>
        )}

        {match.venue && (
          <div className="text-xs text-muted-foreground text-center">📍 {match.venue}</div>
        )}

        {/* "Ver detalles" sólo si el cierre fue por tiempo o el partido terminó (no por bloqueo manual del admin). */}
        {(match.status === "finished" || closedByTime) && <MatchDetailsDialog match={match} />}
      </CardContent>
    </Card>
  );
}

function ScoreStepper({
  value, onChange, onUp, onDown, disabled, ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onUp: () => void;
  onDown: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onUp}
        disabled={disabled}
        className="h-6 w-12 rounded-md border bg-muted/50 hover:bg-muted disabled:opacity-50 flex items-center justify-center"
        aria-label="Subir"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={ariaLabel}
        className="w-12 h-10 text-center text-xl font-bold p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={onDown}
        disabled={disabled}
        className="h-6 w-12 rounded-md border bg-muted/50 hover:bg-muted disabled:opacity-50 flex items-center justify-center"
        aria-label="Bajar"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}

function TeamBig({ name, flag, reverse }: { name: string; flag: string | null; reverse?: boolean }) {
  const arg = isArgentina(name);
  return (
    <div className={`flex flex-col items-center gap-1.5 min-w-0 px-1 ${reverse ? "" : ""}`}>
      {flag ? (
        <img
          src={flag}
          alt={name}
          className="h-12 w-12 sm:h-14 sm:w-14 rounded-full object-cover bg-muted ring-1 ring-border"
        />
      ) : (
        <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-muted ring-1 ring-border" />
      )}
      <span
        className={`font-bold text-xs sm:text-sm uppercase tracking-wide text-center leading-tight break-words ${arg ? "text-argentina" : ""}`}
      >
        {name}
      </span>
    </div>
  );
}
