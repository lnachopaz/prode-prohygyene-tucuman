import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, Calculator, Lock, RotateCcw, Download, RefreshCw } from "lucide-react";
import { formatAR, arLocalInputToUTC } from "@/lib/datetime";
import { translateTeamName } from "@/lib/teamNames";
import { formatGroupName } from "@/lib/groupNames";

interface AdminMatch {
  id: string;
  external_id: string | null;
  kickoff_at: string;
  stage: string;
  group_name: string | null;
  team_a: string;
  team_b: string;
  score_a: number | null;
  score_b: number | null;
  status: string;
  predictions_lock_mode: "auto" | "force_open" | "force_closed" | null;
  point_multiplier: number | null;
  team_a_multiplier: number | null;
  team_b_multiplier: number | null;
}

export function MatchesAdmin() {
  const qc = useQueryClient();
  const { data: matches, isLoading } = useQuery({
    queryKey: ["admin-matches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("matches").select("*").order("kickoff_at");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <NewMatchDialog onCreated={() => qc.invalidateQueries({ queryKey: ["admin-matches"] })} />
        <ImportMatchDialog onImported={() => qc.invalidateQueries({ queryKey: ["admin-matches"] })} />
        <span className="text-xs text-muted-foreground self-center">
          Los resultados oficiales (90') se cargan automáticamente al finalizar cada partido.
        </span>
      </div>

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : (
        <div className="space-y-2">
          {matches?.map((m: any) => (
            <MatchAdminRow key={m.id} match={m} onChange={() => {
              qc.invalidateQueries({ queryKey: ["admin-matches"] });
              qc.invalidateQueries({ queryKey: ["matches"] });
              qc.invalidateQueries({ queryKey: ["leaderboard"] });
            }} />
          ))}
          {matches?.length === 0 && <p className="text-muted-foreground text-sm">No hay partidos cargados.</p>}
        </div>
      )}
    </div>
  );
}

const COMPETITIONS = [
  { code: "WC",  label: "🏆 Copa del Mundo 2026" },
  { code: "PD",  label: "La Liga (España)" },
  { code: "SD",  label: "Segunda División (España)" },
  { code: "CDR", label: "Copa del Rey" },
  { code: "CL",  label: "Champions League" },
  { code: "PL",  label: "Premier League" },
  { code: "BL1", label: "Bundesliga" },
  { code: "SA",  label: "Serie A" },
  { code: "FL1", label: "Ligue 1" },
];

function ImportMatchDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [competition, setCompetition] = useState("PD");
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Array<{ home: string; away: string; kickoff: string; status: string; reason?: string }> | null>(null);

  async function handleImport() {
    setBusy(true);
    setResults(null);
    const { data, error } = await supabase.functions.invoke("import-match", {
      body: { competition, date },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setResults(data.results ?? []);
    if (data.imported > 0 || data.updated > 0) {
      const parts = [];
      if (data.imported > 0) parts.push(`${data.imported} importado(s)`);
      if (data.updated > 0) parts.push(`${data.updated} actualizado(s)`);
      toast.success(parts.join(" · "));
      onImported();
    } else if (data.skipped > 0) {
      toast.info("Los partidos ya estaban cargados y los equipos ya están definidos");
    } else {
      toast.info(data.message ?? "No se encontraron partidos");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); setResults(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-2" />Importar de Football-Data</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar partido</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Competición</Label>
            <Select value={competition} onValueChange={setCompetition}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMPETITIONS.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleImport} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Buscar e importar
          </Button>
          {results && (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="text-sm flex items-center justify-between gap-2 py-1 border-b last:border-0">
                  <span className="font-medium">{r.home} vs {r.away}</span>
                  {r.status === "imported"
                    ? <Badge className="bg-success text-success-foreground">Importado</Badge>
                    : r.status === "updated"
                    ? <Badge className="bg-amber-500 hover:bg-amber-500 text-white" title={r.reason}>Actualizado</Badge>
                    : r.status === "skipped"
                    ? <Badge variant="outline">Ya existía</Badge>
                    : <Badge variant="destructive">Error</Badge>}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MatchAdminRow({ match, onChange }: { match: AdminMatch; onChange: () => void }) {
  const [sa, setSa] = useState<string>(match.score_a?.toString() ?? "");
  const [sb, setSb] = useState<string>(match.score_b?.toString() ?? "");
  const [status, setStatus] = useState(match.status);
  const [stageEdit, setStageEdit] = useState(match.stage ?? "");
  const [pointMult, setPointMult] = useState<string>(match.point_multiplier?.toString() ?? "1");
  const [teamAMult, setTeamAMult] = useState<string>(match.team_a_multiplier?.toString() ?? "1");
  const [teamBMult, setTeamBMult] = useState<string>(match.team_b_multiplier?.toString() ?? "1");
  const [busy, setBusy] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [resyncBusy, setResyncBusy] = useState(false);
  const lockMode: "auto" | "force_open" | "force_closed" = match.predictions_lock_mode ?? "auto";

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("matches").update({
      score_a: sa === "" ? null : parseInt(sa, 10),
      score_b: sb === "" ? null : parseInt(sb, 10),
      status: status as "finished" | "live" | "scheduled",
      stage: stageEdit || null,
      point_multiplier: parseFloat(pointMult) || 1,
      team_a_multiplier: parseFloat(teamAMult) || 1,
      team_b_multiplier: parseFloat(teamBMult) || 1,
    }).eq("id", match.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Partido actualizado · puntos recalculados");
    onChange();
  }

  async function remove() {
    if (!confirm("¿Eliminar este partido?")) return;
    const { error } = await supabase.from("matches").delete().eq("id", match.id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    onChange();
  }

  async function recalc() {
    setRecalcBusy(true);
    const { data, error } = await supabase.rpc("recalc_match_points", { _match_id: match.id });
    setRecalcBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Recalculadas ${data ?? 0} predicciones`);
    onChange();
  }

  async function resync() {
    if (!confirm(`¿Re-sincronizar resultado desde Football-Data?\nEsto pisará el marcador actual con el oficial.`)) return;
    setResyncBusy(true);
    const { data, error } = await supabase.functions.invoke("finalize-finished-matches", {
      body: { match_id: match.id },
    });
    setResyncBusy(false);
    if (error) return toast.error(error.message);
    const r = data?.results?.[0];
    if (!r) return toast.error("Sin respuesta del servidor");
    if (!r.ok) return toast.error(r.error ?? "Error al re-sincronizar");
    toast.success(`Resultado actualizado: ${r.score}`);
    onChange();
  }

  async function restoreDefaults() {
    if (!confirm("¿Restaurar este partido a configuración predeterminada?\n\n• Pronóstico: Automático\n• Marcador: -  -\n• Estado: Programado")) return;
    setBusy(true);
    const { error } = await supabase.from("matches").update({
      predictions_lock_mode: "auto",
      score_a: null,
      score_b: null,
      status: "scheduled",
      test_mode: false,
      point_multiplier: 1,
      team_a_multiplier: 1,
      team_b_multiplier: 1,
    }).eq("id", match.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setSa(""); setSb(""); setStatus("scheduled");
    setPointMult("1"); setTeamAMult("1"); setTeamBMult("1");
    toast.success("↩️ Partido restaurado a configuración predeterminada");
    onChange();
  }

  async function changeLockMode(mode: "auto" | "force_open" | "force_closed") {
    setLockBusy(true);
    const { error } = await supabase.from("matches").update({ predictions_lock_mode: mode }).eq("id", match.id);
    setLockBusy(false);
    if (error) return toast.error(error.message);
    const labels = {
      auto: "Modo automático (cierra 1h antes)",
      force_open: "Pronósticos forzados a ABIERTO",
      force_closed: "Pronósticos forzados a CERRADO",
    } as const;
    toast.success(labels[mode]);
    onChange();
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-center">
          <div>
            <div className="text-xs text-muted-foreground">
              {formatAR(match.kickoff_at, "dd/MM HH:mm")} · {match.stage}
              {match.group_name ? ` · ${formatGroupName(match.group_name)}` : ""}
            </div>
            <div className="font-semibold">{translateTeamName(match.team_a)} vs {translateTeamName(match.team_b)}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="number" className="w-16" value={sa} onChange={(e) => setSa(e.target.value)} placeholder="-" />
            <span>-</span>
            <Input type="number" className="w-16" value={sb} onChange={(e) => setSb(e.target.value)} placeholder="-" />
            <Select value={status} onValueChange={(v) => setStatus(v)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Programado</SelectItem>
                <SelectItem value="live">En vivo</SelectItem>
                <SelectItem value="finished">Finalizado</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={save} disabled={busy} title="Guardar">
              {busy ? <Loader2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={recalc} disabled={recalcBusy} title="Recalcular puntos">
              {recalcBusy ? <Loader2 className="h-4 w-4" /> : <Calculator className="h-4 w-4" />}
            </Button>
            {match.external_id && (
              <Button size="sm" variant="outline" onClick={resync} disabled={resyncBusy} title="Re-sincronizar resultado desde Football-Data (útil si el VAR cambió el marcador)">
                {resyncBusy ? <Loader2 className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={restoreDefaults} title="Restaurar a configuración predeterminada">
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} title="Eliminar">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Pronósticos:</span>
          <Select value={lockMode} onValueChange={(v) => changeLockMode(v as "auto" | "force_open" | "force_closed")} disabled={lockBusy}>
            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automático (1h antes)</SelectItem>
              <SelectItem value="force_open">Forzar abierto</SelectItem>
              <SelectItem value="force_closed">Forzar cerrado</SelectItem>
            </SelectContent>
          </Select>
          {lockMode === "force_open" && <Badge className="text-[10px] bg-green-600 hover:bg-green-600">ABIERTO MANUAL</Badge>}
          {lockMode === "force_closed" && <Badge variant="destructive" className="text-[10px]">CERRADO MANUAL</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs border-t pt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Fase:</span>
            <Input
              className="h-7 w-44 text-xs"
              value={stageEdit}
              onChange={(e) => setStageEdit(e.target.value)}
              placeholder="Ej: Round of 16"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Mult. partido:</span>
            <Input type="number" step="0.1" min="1" className="h-7 w-16 text-xs" value={pointMult} onChange={(e) => setPointMult(e.target.value)} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{match.team_a} ×:</span>
            <Input type="number" step="0.1" min="1" className="h-7 w-16 text-xs" value={teamAMult} onChange={(e) => setTeamAMult(e.target.value)} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{match.team_b} ×:</span>
            <Input type="number" step="0.1" min="1" className="h-7 w-16 text-xs" value={teamBMult} onChange={(e) => setTeamBMult(e.target.value)} />
          </div>
          {(parseFloat(pointMult) !== 1 || parseFloat(teamAMult) !== 1 || parseFloat(teamBMult) !== 1) && (
            <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">
              Mult. activos
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NewMatchDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [kickoff, setKickoff] = useState("");
  const [stage, setStage] = useState("Group Stage");
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!teamA || !teamB || !kickoff) return toast.error("Completá todos los campos");
    setBusy(true);
    const { error } = await supabase.from("matches").insert({
      team_a: teamA, team_b: teamB,
      kickoff_at: arLocalInputToUTC(kickoff).toISOString(),
      stage, group_name: groupName || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Partido creado");
    setOpen(false);
    setTeamA(""); setTeamB(""); setKickoff(""); setGroupName("");
    onCreated();
  }

  if (!open) {
    return <Button variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Nuevo partido</Button>;
  }

  return (
    <Card className="w-full">
      <CardHeader><CardTitle className="text-base">Nuevo partido</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Equipo A</Label><Input value={teamA} onChange={(e) => setTeamA(e.target.value)} /></div>
          <div><Label>Equipo B</Label><Input value={teamB} onChange={(e) => setTeamB(e.target.value)} /></div>
          <div><Label>Kickoff</Label><Input type="datetime-local" value={kickoff} onChange={(e) => setKickoff(e.target.value)} /></div>
          <div><Label>Fase</Label><Input value={stage} onChange={(e) => setStage(e.target.value)} /></div>
          <div className="col-span-2"><Label>Grupo</Label><Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Ej: A" /></div>
        </div>
        <div className="flex gap-2">
          <Button onClick={create} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Crear</Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
