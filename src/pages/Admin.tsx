import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save, Plus, Trash2, Calculator, Lock, MailCheck, FileDown, FileText } from "lucide-react";
import { format, formatDistanceStrict } from "date-fns";
import { es } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function Admin() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Panel admin</h1>
        <p className="text-muted-foreground">Gestioná partidos, usuarios, sync y exportes.</p>
      </div>

      <Tabs defaultValue="matches">
        <TabsList>
          <TabsTrigger value="matches">Partidos</TabsTrigger>
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="codes">Códigos admin</TabsTrigger>
          <TabsTrigger value="sync">Sync &amp; Export</TabsTrigger>
        </TabsList>
        <TabsContent value="matches" className="mt-4"><MatchesAdmin /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersAdmin /></TabsContent>
        <TabsContent value="codes" className="mt-4"><CodesAdmin /></TabsContent>
        <TabsContent value="sync" className="mt-4"><SyncAdmin /></TabsContent>
      </Tabs>
    </div>
  );
}

function MatchesAdmin() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const { data: matches, isLoading } = useQuery({
    queryKey: ["admin-matches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("matches").select("*").order("kickoff_at");
      if (error) throw error;
      return data;
    },
  });

  async function syncFromApi() {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("sync-live-matches");
    setSyncing(false);
    if (error) return toast.error(error.message);
    toast.success(`Sincronizado: ${(data as any)?.updated ?? 0} partidos`);
    qc.invalidateQueries({ queryKey: ["admin-matches"] });
    qc.invalidateQueries({ queryKey: ["matches"] });
    qc.invalidateQueries({ queryKey: ["sync-logs"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={syncFromApi} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sincronizar marcadores en vivo
        </Button>
        <NewMatchDialog onCreated={() => qc.invalidateQueries({ queryKey: ["admin-matches"] })} />
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

function MatchAdminRow({ match, onChange }: { match: any; onChange: () => void }) {
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
              {format(new Date(match.kickoff_at), "dd/MM HH:mm")} · {match.stage}
              {match.group_name ? ` · ${match.group_name}` : ""}
            </div>
            <div className="font-semibold">{match.team_a} vs {match.team_b}</div>
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
            <Button size="sm" variant="ghost" onClick={remove} title="Eliminar">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Pronósticos:</span>
          <Select value={lockMode} onValueChange={(v) => changeLockMode(v as any)} disabled={lockBusy}>
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
      kickoff_at: new Date(kickoff).toISOString(),
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

function UsersAdmin() {
  const qc = useQueryClient();
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase.from("profiles").select("*").order("display_name");
      if (error) throw error;
      const { data: roles } = await supabase.from("user_roles").select("*");
      return profiles.map((p) => ({
        ...p,
        is_admin: roles?.some((r) => r.user_id === p.id && r.role === "admin") ?? false,
      }));
    },
  });

  // Pendientes con info de email confirmado
  const { data: pendingDetailed } = useQuery({
    queryKey: ["admin-pending-detailed"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_pending_signups");
      if (error) throw error;
      return data as Array<{ id: string; display_name: string; created_at: string; email: string; email_confirmed_at: string | null }>;
    },
  });

  async function toggleAdmin(userId: string, makeAdmin: boolean) {
    if (makeAdmin) {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
      if (error) return toast.error(error.message);
    }
    toast.success("Rol actualizado");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  async function rename(userId: string, newName: string) {
    const { error } = await supabase.from("profiles").update({ display_name: newName }).eq("id", userId);
    if (error) return toast.error(error.message);
    toast.success("Nombre actualizado");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  async function setStatus(userId: string, status: "approved" | "rejected" | "pending") {
    const { error } = await supabase.rpc("set_user_status", { _user_id: userId, _status: status });
    if (error) return toast.error(error.message);
    toast.success(status === "approved" ? "Usuario aprobado" : status === "rejected" ? "Usuario rechazado" : "Marcado como pendiente");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-pending-detailed"] });
  }

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  const pending = pendingDetailed ?? [];
  const others = users?.filter((u: any) => u.status !== "pending") ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          Pendientes de aprobación
          {pending.length > 0 && <Badge>{pending.length}</Badge>}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
        ) : (
          pending.map((u) => (
            <Card key={u.id}>
              <CardContent className="p-3 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-medium">{u.display_name}</p>
                  <p className="text-xs text-muted-foreground">{u.email} · Solicitado: {format(new Date(u.created_at), "dd/MM/yyyy HH:mm")}</p>
                </div>
                {u.email_confirmed_at ? (
                  <Badge className="bg-success text-success-foreground gap-1"><MailCheck className="h-3 w-3" /> Email verificado</Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">Email sin verificar</Badge>
                )}
                <Button size="sm" onClick={() => setStatus(u.id, "approved")}>Aprobar</Button>
                <Button size="sm" variant="destructive" onClick={() => setStatus(u.id, "rejected")}>Rechazar</Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Usuarios</h2>
        {others.map((u: any) => (
          <UserRow
            key={u.id}
            user={u}
            onRename={(n: string) => rename(u.id, n)}
            onToggleAdmin={() => toggleAdmin(u.id, !u.is_admin)}
            onReject={() => setStatus(u.id, "rejected")}
          />
        ))}
      </div>
    </div>
  );
}

function UserRow({ user, onRename, onToggleAdmin, onReject }: any) {
  const [name, setName] = useState(user.display_name);
  return (
    <Card>
      <CardContent className="p-3 flex flex-wrap items-center gap-2">
        <Input className="flex-1 min-w-[180px]" value={name} onChange={(e) => setName(e.target.value)} />
        <Button size="sm" variant="outline" onClick={() => onRename(name)}>Guardar</Button>
        {user.is_admin && <Badge>Admin</Badge>}
        {user.status === "rejected" && <Badge variant="destructive">Rechazado</Badge>}
        <Button size="sm" variant={user.is_admin ? "destructive" : "default"} onClick={onToggleAdmin}>
          {user.is_admin ? "Quitar admin" : "Hacer admin"}
        </Button>
        {user.status === "approved" && !user.is_admin && (
          <Button size="sm" variant="ghost" onClick={onReject}>Bloquear</Button>
        )}
      </CardContent>
    </Card>
  );
}

function CodesAdmin() {
  const qc = useQueryClient();
  const [newCode, setNewCode] = useState("");
  const { data: codes } = useQuery({
    queryKey: ["admin-codes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_invite_codes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function add() {
    if (!newCode.trim()) return;
    const { error } = await supabase.from("admin_invite_codes").insert({ code: newCode.trim(), active: true });
    if (error) return toast.error(error.message);
    toast.success("Código creado");
    setNewCode("");
    qc.invalidateQueries({ queryKey: ["admin-codes"] });
  }

  async function toggle(id: string, active: boolean) {
    const { error } = await supabase.from("admin_invite_codes").update({ active: !active }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-codes"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("admin_invite_codes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-codes"] });
  }

  return (
    <div className="space-y-4 max-w-xl">
      <Card>
        <CardHeader><CardTitle className="text-base">Nuevo código</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="ej: PH-ADMIN-2026" />
          <Button onClick={add}><Plus className="h-4 w-4 mr-2" />Crear</Button>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {codes?.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-3 flex items-center gap-2">
              <code className="flex-1 font-mono">{c.code}</code>
              {c.active ? <Badge className="bg-success text-success-foreground">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}
              <Button size="sm" variant="outline" onClick={() => toggle(c.id, c.active)}>
                {c.active ? "Desactivar" : "Activar"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(c.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SyncAdmin() {
  const qc = useQueryClient();
  const { data: logs, isLoading } = useQuery({
    queryKey: ["sync-logs"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  async function runSync() {
    const { error } = await supabase.functions.invoke("sync-live-matches");
    if (error) return toast.error(error.message);
    toast.success("Sync ejecutado");
    qc.invalidateQueries({ queryKey: ["sync-logs"] });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Logs de sincronización
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button size="sm" onClick={runSync}><RefreshCw className="h-4 w-4 mr-2" />Forzar sync ahora</Button>

          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay ejecuciones registradas.</p>
          ) : (
            <Accordion type="multiple" className="w-full">
              {logs.map((l: any) => {
                const dur = l.finished_at
                  ? formatDistanceStrict(new Date(l.finished_at), new Date(l.started_at), { locale: es })
                  : "—";
                const badge =
                  l.status === "success" ? <Badge className="bg-success text-success-foreground">OK</Badge>
                  : l.status === "partial" ? <Badge variant="secondary">Parcial</Badge>
                  : l.status === "running" ? <Badge variant="outline">En curso</Badge>
                  : <Badge variant="destructive">Error</Badge>;
                return (
                  <AccordionItem key={l.id} value={l.id}>
                    <AccordionTrigger className="text-sm hover:no-underline">
                      <div className="flex flex-wrap items-center gap-2 w-full pr-2">
                        <span className="font-mono text-xs">{format(new Date(l.started_at), "dd/MM HH:mm:ss")}</span>
                        <span className="text-muted-foreground">{l.function_name}</span>
                        {badge}
                        <span className="text-xs text-muted-foreground">· {l.updated_count} partidos · {dur}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {l.error_message && (
                        <p className="text-sm text-destructive mb-2">⚠️ {l.error_message}</p>
                      )}
                      <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-64">
{JSON.stringify(l.details ?? {}, null, 2)}
                      </pre>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <ExportRanking />
    </div>
  );
}

function ExportRanking() {
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);

  async function loadRanking() {
    const { data: profiles, error: pErr } = await supabase.from("profiles").select("id, display_name").eq("status", "approved");
    if (pErr) throw pErr;
    const { data: matches, error: mErr } = await supabase.from("matches").select("id, status, score_a, score_b");
    if (mErr) throw mErr;
    const { data: preds, error: prErr } = await supabase.from("predictions").select("user_id, match_id, pred_a, pred_b, points");
    if (prErr) throw prErr;

    const finishedIds = new Set((matches ?? []).filter((m: any) => m.status === "finished").map((m: any) => m.id));
    const rows = (profiles ?? []).map((p: any) => {
      const mine = (preds ?? []).filter((x: any) => x.user_id === p.id && finishedIds.has(x.match_id));
      const total = mine.reduce((s, x) => s + (x.points ?? 0), 0);
      const exact = mine.filter((x) => x.points === 3).length;
      const result = mine.filter((x) => x.points === 1).length;
      return {
        name: p.display_name,
        points: total,
        played: mine.length,
        exact,
        result,
        avg: mine.length ? (total / mine.length).toFixed(2) : "0.00",
      };
    });
    rows.sort((a, b) => b.points - a.points);
    return rows.map((r, i) => ({ pos: i + 1, ...r }));
  }

  async function exportCSV() {
    setBusy("csv");
    try {
      const rows = await loadRanking();
      const header = ["Posicion", "Nombre", "Puntos", "Jugados", "Exactos", "Resultado", "Promedio"];
      const csv = [
        header.join(","),
        ...rows.map((r) => [r.pos, `"${r.name.replace(/"/g, '""')}"`, r.points, r.played, r.exact, r.result, r.avg].join(",")),
      ].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ranking-mundial-2026-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV descargado");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function exportPDF() {
    setBusy("pdf");
    try {
      const rows = await loadRanking();
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("Ranking Final · Prode Mundial 2026", 14, 16);
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 22);
      autoTable(doc, {
        startY: 28,
        head: [["#", "Nombre", "Puntos", "Jugados", "Exactos", "Resultado", "Promedio"]],
        body: rows.map((r) => [r.pos, r.name, r.points, r.played, r.exact, r.result, r.avg]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 64, 175] },
      });
      doc.save(`ranking-mundial-2026-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
      toast.success("PDF descargado");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileDown className="h-4 w-4" /> Backup / Export del ranking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Descargá el ranking final con stats por usuario para archivar o compartir al terminar el Mundial.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={busy !== null}>
            {busy === "csv" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
            Exportar CSV
          </Button>
          <Button variant="outline" onClick={exportPDF} disabled={busy !== null}>
            {busy === "pdf" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Exportar PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
