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
import { Loader2, Save, Lock, X, Pencil, Sparkles } from "lucide-react";
import { MatchDetailsDialog } from "@/components/MatchDetailsDialog";
import { toast } from "sonner";
import { format, isAfter, subHours } from "date-fns";
import { es } from "date-fns/locale";
import { getCountryFlagUrl } from "@/lib/countryFlags";
import { formatAR } from "@/lib/datetime";
import { getMultiplierInfo } from "@/lib/scoring";
import { formatPoints } from "@/lib/formatPoints";

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
  multiplier_override?: number | null;
  team_multiplier_override?: { team: string; mult: number } | null;
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
      return (data ?? []) as unknown as Match[];
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
      if (term && !m.team_a.toLowerCase().includes(term) && !m.team_b.toLowerCase().includes(term)) return false;
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
        <p className="text-muted-foreground">Cargá tus marcadores antes del cierre (1 hora antes del partido).</p>
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <strong className="text-foreground">Importante:</strong>{" "}
        <span className="text-muted-foreground">
          Los resultados oficiales (90 min) y el cálculo de puntos se cargarán y mostrarán
          únicamente al finalizar cada partido.
        </span>
      </div>

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
            {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
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
                  team_a_flag: getCountryFlagUrl(m.team_a) ?? m.team_a_flag,
                  team_b_flag: getCountryFlagUrl(m.team_b) ?? m.team_b_flag,
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
  const lockAt = subHours(new Date(match.kickoff_at), 1);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const lockMode = match.predictions_lock_mode ?? "auto";
  const timeLocked = !isAfter(lockAt, now) || match.status !== "scheduled";
  const lockedByAdmin = lockMode === "force_closed";
  const forcedOpen = lockMode === "force_open" && match.status === "scheduled";

  // Estado de la ventana de carga (fecha del torneo)
  const windowOpen = !predWindow
    ? true
    : now >= new Date(predWindow.opens_at) && now <= new Date(predWindow.closes_at);
  const windowNotYetOpen = predWindow ? now < new Date(predWindow.opens_at) : false;
  const windowClosed = predWindow ? now > new Date(predWindow.closes_at) : false;

  const locked =
    lockedByAdmin ||
    (!forcedOpen && (timeLocked || !windowOpen));

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
    if (lockedByAdmin) return <Badge variant="destructive" className="gap-1"><Lock className="h-3 w-3" /> Bloqueado por admin</Badge>;
    if (forcedOpen && timeLocked) return <Badge className="gap-1 bg-green-600 hover:bg-green-600">Reabierto por admin</Badge>;
    if (windowNotYetOpen && predWindow)
      return <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Abre {formatAR(predWindow.opens_at, "dd/MM HH:mm")}</Badge>;
    if (windowClosed && predWindow)
      return <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Ventana cerrada</Badge>;
    if (locked) return <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Cerrado</Badge>;
    return <Badge variant="outline">{formatAR(match.kickoff_at, "HH:mm 'hs'")}</Badge>;
  };

  const multInfo = getMultiplierInfo(match.team_a, match.team_b, match.stage, match.multiplier_override);

  // Cuenta regresiva al cierre
  const minutesToLock = Math.max(0, Math.floor((lockAt.getTime() - now.getTime()) / 60000));
  const closingSoon = match.status === "scheduled" && !locked && minutesToLock <= 180 && minutesToLock > 0;

  function countdownText() {
    if (minutesToLock <= 0) return "Cerrado";
    const h = Math.floor(minutesToLock / 60);
    const m = minutesToLock % 60;
    if (h > 24) return `Cierra en ${Math.floor(h / 24)}d ${h % 24}h`;
    if (h > 0) return `Cierra en ${h}h ${m}m`;
    return `Cierra en ${m}m`;
  }

  function adjust(side: "a" | "b", delta: number) {
    if (locked) return;
    const cur = parseInt(side === "a" ? a : b, 10);
    const next = Math.max(0, (isNaN(cur) ? 0 : cur) + delta);
    if (side === "a") setA(String(next)); else setB(String(next));
  }

  const isPleno =
    prediction != null && match.status === "finished" &&
    prediction.pred_a === match.score_a && prediction.pred_b === match.score_b;
  const isAcierto =
    prediction != null && match.status === "finished" && !isPleno &&
    Math.sign(prediction.pred_a - prediction.pred_b) === Math.sign((match.score_a ?? 0) - (match.score_b ?? 0));

  const isArgentina =
    match.team_a.toLowerCase().includes("argentina") || match.team_b.toLowerCase().includes("argentina");

  return (
    <Card
      className={`overflow-hidden transition-shadow ${
        isArgentina ? "border-2 border-sky-400 shadow-[0_0_0_1px_hsl(var(--background)),0_4px_12px_-2px_rgb(56_189_248/0.4)]" : ""
      } ${match.status === "live" ? "border-destructive/50 shadow-md" : ""}`}
    >
      <CardContent className="p-3 sm:p-4 space-y-3">
        {/* Header: fase + grupo + estado */}
        <div className="flex items-start justify-between gap-2 text-xs">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-foreground/80 truncate">
              {match.stage}
              {match.group_name ? ` · ${match.group_name}` : ""}
            </div>
            <div className="text-muted-foreground mt-0.5 flex items-center flex-wrap gap-x-2">
              <span>{formatAR(match.kickoff_at, "EEE dd/MM · HH:mm 'hs'")}</span>
              {match.venue && <span className="truncate">· {match.venue}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {statusBadge()}
            {multInfo && (
              <Badge
                variant="default"
                className="gap-1 bg-amber-500 hover:bg-amber-500 text-white text-[10px] py-0"
                title={`Multiplicador ${multInfo.label} — ${multInfo.reasons.join(" + ")}`}
              >
                <Sparkles className="h-3 w-3" />
                {multInfo.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Equipos + marcador */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
          <TeamSide name={match.team_a} flag={match.team_a_flag} align="end" />
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1.5">
              <ScoreInput value={a} onChange={setA} onPlus={() => adjust("a", 1)} onMinus={() => adjust("a", -1)} disabled={locked} />
              <span className="text-muted-foreground font-bold text-sm">vs</span>
              <ScoreInput value={b} onChange={setB} onPlus={() => adjust("b", 1)} onMinus={() => adjust("b", -1)} disabled={locked} />
            </div>
            {match.status === "finished" && (
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Tu pronóstico</div>
            )}
          </div>
          <TeamSide name={match.team_b} flag={match.team_b_flag} align="start" />
        </div>

        {/* Resultado real cuando está finalizado */}
        {match.status === "finished" && (
          <div className="rounded-md bg-muted px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground text-xs">Resultado final</span>
              <strong className="text-foreground text-base tabular-nums">{match.score_a} - {match.score_b}</strong>
            </div>
            {prediction ? (
              <div className="flex items-center justify-between">
                <Badge
                  variant="outline"
                  className={
                    isPleno ? "border-success text-success" :
                    isAcierto ? "border-warning text-warning" :
                    "text-muted-foreground"
                  }
                >
                  {isPleno ? "Pleno" : isAcierto ? "Resultado" : "Sin acierto"}
                </Badge>
                <span className={`font-bold text-sm ${isPleno ? "text-success" : isAcierto ? "text-warning" : "text-muted-foreground"}`}>
                  +{formatPoints(prediction.points)} pts
                </span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">No cargaste pronóstico</div>
            )}
          </div>
        )}

        {/* Marcador en vivo */}
        {match.status === "live" && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-destructive font-semibold flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-destructive animate-pulse" />
              EN VIVO
            </span>
            <strong className="tabular-nums text-base">{match.score_a ?? 0} - {match.score_b ?? 0}</strong>
          </div>
        )}

        {/* Countdown al cierre */}
        {match.status === "scheduled" && !locked && (
          <div className={`text-xs flex items-center justify-between ${closingSoon ? "text-warning" : "text-muted-foreground"}`}>
            <span>{countdownText()}</span>
            {prediction && <span>Cargado: {prediction.pred_a}-{prediction.pred_b}</span>}
          </div>
        )}

        {!locked && (
          <Button
            size="sm"
            className={`w-full ${prediction ? "bg-warning text-warning-foreground hover:bg-warning/90" : ""}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : prediction ? (
              <Pencil className="h-4 w-4 mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {prediction ? "Editar pronóstico" : "Guardar pronóstico"}
          </Button>
        )}

        {match.status === "finished" && (
          <MatchDetailsDialog match={match} />
        )}
      </CardContent>
    </Card>
  );
}

function ScoreInput({
  value, onChange, onPlus, onMinus, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onPlus: () => void;
  onMinus: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onPlus}
        disabled={disabled}
        className="h-5 w-10 rounded-sm bg-muted hover:bg-muted/70 disabled:opacity-30 text-xs leading-none font-bold"
        aria-label="Sumar gol"
      >
        ▲
      </button>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        className="w-12 sm:w-14 text-center text-xl font-bold h-10 px-1"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={onMinus}
        disabled={disabled}
        className="h-5 w-10 rounded-sm bg-muted hover:bg-muted/70 disabled:opacity-30 text-xs leading-none font-bold"
        aria-label="Restar gol"
      >
        ▼
      </button>
    </div>
  );
}

function TeamSide({ name, flag, align }: { name: string; flag: string | null; align: "start" | "end" }) {
  const isArg = name.toLowerCase().includes("argentina");
  return (
    <div className={`flex flex-col items-center gap-1.5 min-w-0 ${align === "end" ? "sm:items-end" : "sm:items-start"}`}>
      {flag ? (
        <img
          src={flag}
          alt={name}
          className={`h-10 w-10 sm:h-12 sm:w-12 rounded-full object-cover bg-muted flex-shrink-0 ${
            isArg ? "ring-2 ring-sky-400" : "ring-1 ring-border"
          }`}
        />
      ) : (
        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-muted flex-shrink-0" />
      )}
      <span
        className={`font-semibold text-xs sm:text-sm text-center leading-tight line-clamp-2 max-w-full ${
          isArg ? "text-sky-500" : ""
        }`}
      >
        {name}
      </span>
    </div>
  );
}
