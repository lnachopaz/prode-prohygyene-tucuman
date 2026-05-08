import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, Calculator, Lock, RotateCcw } from "lucide-react";
import { formatAR, arLocalInputToUTC } from "@/lib/datetime";
import { translateTeamName } from "@/lib/teamNames";
import { formatGroupName } from "@/lib/groupNames";

interface AdminMatch {
  id: string;
  kickoff_at: string;
  stage: string;
  group_name: string | null;
  team_a: string;
  team_b: string;
  score_a: number | null;
  score_b: number | null;
  status: string;
  predictions_lock_mode: "auto" | "force_open" | "force_closed" | null;
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

function MatchAdminRow({ match, onChange }: { match: AdminMatch; onChange: () => void }) {
  const [sa, setSa] = useState<string>(match.score_a?.toString() ?? "");
  const [sb, setSb] = useState<string>(match.score_b?.toString() ?? "");
  const [status, setStatus] = useState(match.status);
  const [busy, setBusy] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const lockMode: "auto" | "force_open" | "force_closed" = match.predictions_lock_mode ?? "auto";

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("matches").update({
      score_a: sa === "" ? null : parseInt(sa, 10),
      score_b: sb === "" ? null : parseInt(sb, 10),
      status,
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

  async function restoreDefaults() {
    if (!confirm("¿Restaurar este partido a configuración predeterminada?\n\n• Pronóstico: Automático\n• Marcador: -  -\n• Estado: Programado")) return;
    setBusy(true);
    const { error } = await supabase.from("matches").update({
      predictions_lock_mode: "auto",
      score_a: null,
      score_b: null,
      status: "scheduled",
      test_mode: false,
    }).eq("id", match.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setSa(""); setSb(""); setStatus("scheduled");
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
