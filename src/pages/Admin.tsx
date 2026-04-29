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
import { Loader2, RefreshCw, Save, Plus, Trash2, Calculator, Lock, MailCheck, FileDown, FileText, FlaskConical, Play, Square, Goal, RotateCcw, Eye, FastForward, Zap, Search } from "lucide-react";
import { fetchAllPaginated } from "@/lib/fetchAll";
import { format, formatDistanceStrict } from "date-fns";
import { es } from "date-fns/locale";
import { formatAR, arLocalInputToUTC } from "@/lib/datetime";
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
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="matches">Partidos</TabsTrigger>
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="predictions">Pronósticos</TabsTrigger>
          <TabsTrigger value="codes">Códigos admin</TabsTrigger>
          <TabsTrigger value="sync">Sync &amp; Export</TabsTrigger>
          <TabsTrigger value="test">🧪 Modo prueba</TabsTrigger>
        </TabsList>
        <TabsContent value="matches" className="mt-4"><MatchesAdmin /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersAdmin /></TabsContent>
        <TabsContent value="predictions" className="mt-4"><PredictionsAdmin /></TabsContent>
        <TabsContent value="codes" className="mt-4"><CodesAdmin /></TabsContent>
        <TabsContent value="sync" className="mt-4"><SyncAdmin /></TabsContent>
        <TabsContent value="test" className="mt-4"><TestModeAdmin /></TabsContent>
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
              {formatAR(match.kickoff_at, "dd/MM HH:mm")} · {match.stage}
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

function UsersAdmin() {
  const qc = useQueryClient();
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase.from("profiles").select("*").order("display_name");
      if (error) throw error;
      const { data: roles } = await supabase.from("user_roles").select("*");
      const { data: emails } = await supabase.rpc("list_users_with_email");
      const { data: lb } = await supabase
        .from("leaderboard")
        .select("user_id, total_points, predictions_count")
        .order("total_points", { ascending: false });
      const rankMap = new Map<string, number>();
      (lb ?? []).forEach((row: any, idx: number) => {
        if (row.user_id) rankMap.set(row.user_id, idx + 1);
      });
      const lbMap = new Map<string, any>();
      (lb ?? []).forEach((row: any) => row.user_id && lbMap.set(row.user_id, row));
      const emailMap = new Map<string, string>();
      (emails ?? []).forEach((row: any) => emailMap.set(row.id, row.email));
      return profiles.map((p) => ({
        ...p,
        is_admin: roles?.some((r) => r.user_id === p.id && r.role === "admin") ?? false,
        email: emailMap.get(p.id) ?? "",
        rank: rankMap.get(p.id) ?? null,
        total_points: lbMap.get(p.id)?.total_points ?? 0,
        predictions_count: lbMap.get(p.id)?.predictions_count ?? 0,
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

  async function deleteUser(userId: string, displayName: string) {
    if (!confirm(`¿Eliminar definitivamente a "${displayName}"? Se borrarán todos sus datos (pronósticos, perfil y cuenta). El email quedará libre para registrarse de nuevo.`)) return;
    const { error } = await supabase.rpc("delete_user_completely", { _user_id: userId });
    if (error) return toast.error(error.message);
    toast.success("Usuario eliminado");
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
                <Button size="sm" variant="outline" onClick={() => setStatus(u.id, "rejected")}>Rechazar</Button>
                <Button size="sm" variant="destructive" onClick={() => deleteUser(u.id, u.display_name)}>Eliminar</Button>
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
            onReject={() => setStatus(u.id, "rejected")}
            onUnblock={() => setStatus(u.id, "approved")}
            onDelete={() => deleteUser(u.id, u.display_name)}
          />
        ))}
      </div>
    </div>
  );
}

function UserRow({ user, onRename, onReject, onUnblock, onDelete }: any) {
  const [name, setName] = useState(user.display_name);
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="flex-1 min-w-[180px]" value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="sm" variant="outline" onClick={() => onRename(name)}>Guardar</Button>
          {user.is_admin && <Badge>Admin</Badge>}
          {user.status === "rejected" && <Badge variant="destructive">Bloqueado</Badge>}
          {user.status === "approved" && !user.is_admin && (
            <Button size="sm" variant="ghost" onClick={onReject}>Bloquear</Button>
          )}
          {user.status === "rejected" && (
            <Button size="sm" onClick={onUnblock}>Desbloquear</Button>
          )}
          {!user.is_admin && (
            <Button size="sm" variant="destructive" onClick={onDelete}>Eliminar</Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>📧 {user.email || "—"}</span>
          <Badge variant="outline">
            {user.rank ? `#${user.rank} en ranking` : "Sin ranking"}
            {user.rank ? ` · ${user.total_points} pts` : ""}
          </Badge>
          <Badge variant="outline">{user.predictions_count} pronósticos</Badge>
        </div>
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
      <BackupAllPredictions />
    </div>
  );
}

function ExportRanking() {
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);

  async function loadRanking() {
    // Use server-side leaderboard view (1 row per user) → no 1000-row limit issue.
    const { data: lb, error: lbErr } = await supabase
      .from("leaderboard")
      .select("user_id, display_name, total_points, exact_hits, result_hits, predictions_count")
      .order("total_points", { ascending: false })
      .order("exact_hits", { ascending: false });
    if (lbErr) throw lbErr;
    const rows = (lb ?? []).map((r: any, i: number) => {
      const played = r.predictions_count || 0;
      const total = r.total_points || 0;
      return {
        pos: i + 1,
        name: r.display_name,
        points: total,
        played,
        exact: r.exact_hits || 0,
        result: r.result_hits || 0,
        avg: played ? (total / played).toFixed(2) : "0.00",
      };
    });
    return rows;
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

// ============================================================
// MODO PRUEBA: simulador rápido para validar el flujo end-to-end
// ============================================================
function TestModeAdmin() {
  const qc = useQueryClient();
  const { data: matches, isLoading } = useQuery({
    queryKey: ["test-matches"],
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("id, team_a, team_b, status, score_a, score_b, kickoff_at, predictions_lock_mode, test_mode")
        .order("kickoff_at");
      if (error) throw error;
      return data;
    },
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["test-matches"] });
    qc.invalidateQueries({ queryKey: ["admin-matches"] });
    qc.invalidateQueries({ queryKey: ["matches"] });
    qc.invalidateQueries({ queryKey: ["leaderboard"] });
  }

  async function enableTestMode(id: string) {
    const { error } = await supabase.from("matches").update({ test_mode: true }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("🧪 Modo prueba activado · el sync automático no tocará este partido");
    refresh();
  }

  async function disableTestMode(id: string) {
    const { error } = await supabase.from("matches").update({ test_mode: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("✅ Modo prueba desactivado · vuelve al sync automático");
    refresh();
  }

  async function setLive(id: string) {
    // Activamos test_mode al pasar a vivo manualmente para que el sync no lo sobrescriba.
    const { error } = await supabase.from("matches").update({
      status: "live", score_a: 0, score_b: 0, test_mode: true,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("⚽ EN VIVO (0-0) · modo prueba activado");
    refresh();
  }

  async function addGoal(id: string, side: "a" | "b", current: { score_a: number | null; score_b: number | null }) {
    const score_a = (current.score_a ?? 0) + (side === "a" ? 1 : 0);
    const score_b = (current.score_b ?? 0) + (side === "b" ? 1 : 0);
    const { error } = await supabase.from("matches").update({ score_a, score_b, test_mode: true }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Gol ${side === "a" ? "local" : "visitante"} → ${score_a}-${score_b}`);
    refresh();
  }

  async function finish(id: string) {
    const { error } = await supabase.from("matches").update({ status: "finished" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("🏁 Partido finalizado · puntos calculados automáticamente");
    refresh();
  }

  async function reset(id: string) {
    // Al resetear, también desactivamos el modo prueba para que el sync vuelva a tomarlo.
    const { error } = await supabase.from("matches").update({
      status: "scheduled", score_a: null, score_b: null, test_mode: false,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("↩️ Reseteado · modo prueba desactivado");
    refresh();
  }

  async function simulateTwoLive() {
    const scheduled = (matches ?? []).filter((m: any) => m.status === "scheduled").slice(0, 2);
    if (scheduled.length < 2) return toast.error("Necesitás al menos 2 partidos programados");
    for (const m of scheduled) {
      await supabase.from("matches").update({ status: "live", score_a: 0, score_b: 0, test_mode: true }).eq("id", m.id);
    }
    toast.success("⚽⚽ 2 partidos simultáneos en vivo (modo prueba)");
    refresh();
  }

  async function resetAllLive() {
    const live = (matches ?? []).filter((m: any) => m.status === "live");
    if (live.length === 0) return toast.error("No hay partidos en vivo");
    for (const m of live) {
      await supabase.from("matches").update({ status: "scheduled", score_a: null, score_b: null, test_mode: false }).eq("id", m.id);
    }
    toast.success(`↩️ ${live.length} partidos reseteados`);
    refresh();
  }

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  const liveMatches = (matches ?? []).filter((m: any) => m.status === "live");
  const scheduledSoon = (matches ?? []).filter((m: any) => m.status === "scheduled").slice(0, 6);
  const finished = (matches ?? []).filter((m: any) => m.status === "finished").slice(-3);

  return (
    <div className="space-y-6">
      <BulkSimulator />
      <Card className="border-yellow-500/40 bg-yellow-500/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-yellow-600" /> Modo prueba
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Simulá el ciclo completo de un partido sin esperar a que jueguen de verdad. Los cambios afectan datos reales (predicciones, ranking), así que <strong>acordate de resetear</strong> los partidos cuando termines de probar.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={simulateTwoLive}>
              <Play className="h-4 w-4 mr-2" />Simular 2 partidos simultáneos
            </Button>
            <Button size="sm" variant="outline" onClick={resetAllLive}>
              <RotateCcw className="h-4 w-4 mr-2" />Resetear todos los "en vivo"
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* En vivo */}
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          En vivo ({liveMatches.length})
        </h3>
        {liveMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún partido en vivo.</p>
        ) : (
          <div className="space-y-2">
            {liveMatches.map((m: any) => (
              <Card key={m.id}>
                <CardContent className="p-3 flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-semibold flex items-center gap-2">
                      {m.team_a} vs {m.team_b}
                      {m.test_mode && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 font-medium">🧪 PRUEBA</span>
                      )}
                    </div>
                    <div className="text-2xl font-mono mt-1">{m.score_a ?? 0} - {m.score_b ?? 0}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => addGoal(m.id, "a", m)}>
                    <Goal className="h-4 w-4 mr-1" />Gol {m.team_a}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => addGoal(m.id, "b", m)}>
                    <Goal className="h-4 w-4 mr-1" />Gol {m.team_b}
                  </Button>
                  <Button size="sm" onClick={() => finish(m.id)}>
                    <Square className="h-4 w-4 mr-1" />Finalizar
                  </Button>
                  {m.test_mode ? (
                    <Button size="sm" variant="outline" onClick={() => disableTestMode(m.id)} title="Desactivar modo prueba (vuelve al sync automático)">
                      ✅ Salir prueba
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => enableTestMode(m.id)} title="Activar modo prueba (el sync no lo tocará)">
                      🧪 Activar prueba
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => reset(m.id)}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Programados */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Próximos programados (primeros 6)</h3>
        <div className="space-y-2">
          {scheduledSoon.map((m: any) => (
            <Card key={m.id}>
              <CardContent className="p-3 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-xs text-muted-foreground">{formatAR(m.kickoff_at, "dd/MM HH:mm")}</div>
                  <div className="font-medium flex items-center gap-2">
                    {m.team_a} vs {m.team_b}
                    {m.test_mode && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 font-medium">🧪 PRUEBA</span>
                    )}
                  </div>
                </div>
                {m.test_mode ? (
                  <Button size="sm" variant="outline" onClick={() => disableTestMode(m.id)}>
                    ✅ Salir prueba
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => enableTestMode(m.id)}>
                    🧪 Activar prueba
                  </Button>
                )}
                <Button size="sm" onClick={() => setLive(m.id)}>
                  <Play className="h-4 w-4 mr-1" />Marcar en vivo
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Finalizados recientes (para resetear) */}
      {finished.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Finalizados recientes</h3>
          <div className="space-y-2">
            {finished.map((m: any) => (
              <Card key={m.id}>
                <CardContent className="p-3 flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium">{m.team_a} {m.score_a ?? 0} - {m.score_b ?? 0} {m.team_b}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => reset(m.id)}>
                    <RotateCcw className="h-4 w-4 mr-1" />Resetear
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card className="border-blue-500/40 bg-blue-500/5">
        <CardHeader><CardTitle className="text-base">📋 Checklist sugerido antes de lanzar</CardTitle></CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-1.5 text-sm">
            <li>Cargá un pronóstico tuyo en algún partido programado.</li>
            <li>Acá: marcá ese partido como <strong>En vivo</strong> → andá a la pestaña <strong>Live</strong> y verificá que aparece con tu pronóstico parcial.</li>
            <li>Sumá goles → confirmá que el "Parcial: +X pts" se actualiza.</li>
            <li>Tocá <strong>Finalizar</strong> → andá al <strong>Ranking</strong> y verificá que sumaron los puntos correctos (3 si exacto, 1 si resultado, 0 si no).</li>
            <li>Probá <strong>Simular 2 partidos simultáneos</strong> y esperá ~30s → mirá la pestaña Sync &amp; Export para confirmar que la función procesó ambos sin errores.</li>
            <li>Cambiá el modo de bloqueo de un partido (pestaña Partidos) → confirmá que en <strong>Pronósticos</strong> los inputs se habilitan/deshabilitan según corresponda.</li>
            <li>Cuando termines, <strong>reseteá todos los partidos</strong> que tocaste para que vuelvan a su estado real.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// PRONÓSTICOS DE OTROS USUARIOS (vista admin)
// ============================================================
function PredictionsAdmin() {
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: users } = useQuery({
    queryKey: ["pred-admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, status")
        .eq("status", "approved")
        .order("display_name");
      if (error) throw error;
      const { data: emails } = await supabase.rpc("list_users_with_email");
      const emailMap = new Map<string, string>();
      (emails ?? []).forEach((r: any) => emailMap.set(r.id, r.email));
      return (data ?? []).map((u: any) => ({ ...u, email: emailMap.get(u.id) ?? "" }));
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["pred-admin-rows", selectedUser],
    enabled: !!selectedUser,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("id, pred_a, pred_b, points, match:matches(id, team_a, team_b, stage, group_name, status, score_a, score_b, kickoff_at)")
        .eq("user_id", selectedUser);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const filtered = (rows ?? []).filter((r) => {
    if (!r.match) return false;
    if (statusFilter !== "all" && r.match.status !== statusFilter) return false;
    if (stageFilter !== "all") {
      const s = (r.match.stage || "").toLowerCase();
      if (stageFilter === "groups" && !(s.includes("grupo") || s.includes("group"))) return false;
      if (stageFilter === "r16" && !(s.includes("octavo") || s.includes("round of 16") || s.includes("last 16"))) return false;
      if (stageFilter === "qf" && !(s.includes("cuarto") || s.includes("quarter"))) return false;
      if (stageFilter === "sf" && !s.includes("semi")) return false;
      if (stageFilter === "final" && !(s.includes("final") || s.includes("tercer"))) return false;
    }
    return true;
  }).sort((a, b) => new Date(a.match.kickoff_at).getTime() - new Date(b.match.kickoff_at).getTime());

  const finished = filtered.filter((r) => r.match.status === "finished");
  const totalPts = finished.reduce((s, r) => s + (r.points || 0), 0);
  const exactos = finished.filter((r) => r.points === 3).length;
  const aciertos = finished.filter((r) => r.points === 1).length;
  const efectividad = finished.length ? Math.round(((exactos + aciertos) / finished.length) * 100) : 0;

  const filteredUsers = (users ?? []).filter((u: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  function exportCSV() {
    if (filtered.length === 0) return;
    const userName = users?.find((u: any) => u.id === selectedUser)?.display_name ?? "usuario";
    const header = ["Fecha", "Fase", "Grupo", "Partido", "Pronostico", "Resultado", "Estado", "Puntos"];
    const lines = [header.join(",")];
    for (const r of filtered) {
      const m = r.match;
      const realScore = m.score_a != null && m.score_b != null ? `${m.score_a}-${m.score_b}` : "—";
      lines.push([
        formatAR(m.kickoff_at, "yyyy-MM-dd HH:mm"),
        `"${m.stage}"`,
        m.group_name ?? "",
        `"${m.team_a} vs ${m.team_b}"`,
        `${r.pred_a}-${r.pred_b}`,
        realScore,
        m.status,
        r.points ?? 0,
      ].join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pronosticos-${userName.replace(/\s+/g, "_")}-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" /> Ver pronósticos de cualquier participante
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger><SelectValue placeholder={`Elegí un participante (${filteredUsers.length} disponibles)`} /></SelectTrigger>
            <SelectContent className="max-h-80">
              {filteredUsers.map((u: any) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.display_name} <span className="text-muted-foreground text-xs">· {u.email}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedUser && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Puntos</div><div className="text-2xl font-bold">{totalPts}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Plenos (3pts)</div><div className="text-2xl font-bold text-success">{exactos}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Resultado (1pt)</div><div className="text-2xl font-bold text-warning">{aciertos}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Efectividad</div><div className="text-2xl font-bold">{efectividad}%</div></CardContent></Card>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="scheduled">Programados</SelectItem>
                <SelectItem value="live">En vivo</SelectItem>
                <SelectItem value="finished">Finalizados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las fases</SelectItem>
                <SelectItem value="groups">Grupos</SelectItem>
                <SelectItem value="r16">Octavos</SelectItem>
                <SelectItem value="qf">Cuartos</SelectItem>
                <SelectItem value="sf">Semis</SelectItem>
                <SelectItem value="final">Final</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
              <FileDown className="h-4 w-4 mr-2" />Exportar CSV
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">{filtered.length} pronósticos</span>
          </div>

          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  <div className="grid grid-cols-[120px_1fr_70px_70px_60px] gap-2 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase">
                    <span>Fecha</span><span>Partido</span><span className="text-center">Pron.</span><span className="text-center">Real</span><span className="text-right">Pts</span>
                  </div>
                  {filtered.map((r) => {
                    const m = r.match;
                    const real = m.score_a != null && m.score_b != null ? `${m.score_a}-${m.score_b}` : "—";
                    return (
                      <div key={r.id} className="grid grid-cols-[120px_1fr_70px_70px_60px] gap-2 px-3 py-2 items-center text-sm">
                        <div className="text-xs text-muted-foreground">
                          <div>{formatAR(m.kickoff_at, "dd/MM HH:mm")}</div>
                          <div className="text-[10px]">{m.stage}</div>
                        </div>
                        <div className="font-medium truncate">{m.team_a} vs {m.team_b}</div>
                        <div className="text-center font-mono">{r.pred_a}-{r.pred_b}</div>
                        <div className="text-center font-mono text-muted-foreground">{real}</div>
                        <div className="text-right font-bold">
                          {m.status === "finished" ? (
                            <span className={r.points === 3 ? "text-success" : r.points === 1 ? "text-warning" : "text-muted-foreground"}>
                              {r.points ?? 0}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="px-4 py-8 text-center text-muted-foreground text-sm">No hay pronósticos con esos filtros.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// SIMULADOR MASIVO (panel adicional en Modo Prueba)
// ============================================================
export function BulkSimulator() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["bulk-stats"],
    refetchInterval: 5000,
    queryFn: async () => {
      const [{ count: testUsers }, { count: realUsers }, { data: matches }, predsAll] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).like("display_name", "Test User%"),
        supabase.from("profiles").select("id", { count: "exact", head: true }).not("display_name", "like", "Test User%"),
        supabase.from("matches").select("id, status"),
        fetchAllPaginated<{ id: string }>(() => supabase.from("predictions").select("id")),
      ]);
      const finished = matches?.filter((m: any) => m.status === "finished").length ?? 0;
      const live = matches?.filter((m: any) => m.status === "live").length ?? 0;
      const scheduled = matches?.filter((m: any) => m.status === "scheduled").length ?? 0;
      return {
        testUsers: testUsers ?? 0,
        realUsers: realUsers ?? 0,
        finished, live, scheduled,
        predictions: predsAll.length,
      };
    },
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["bulk-stats"] });
    qc.invalidateQueries({ queryKey: ["test-matches"] });
    qc.invalidateQueries({ queryKey: ["admin-matches"] });
    qc.invalidateQueries({ queryKey: ["matches"] });
    qc.invalidateQueries({ queryKey: ["leaderboard"] });
    qc.invalidateQueries({ queryKey: ["ranking-leaderboard"] });
    qc.invalidateQueries({ queryKey: ["ranking-preds-all"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    qc.invalidateQueries({ queryKey: ["dashboard-top-ranking"] });
  }

  async function advance5() {
    setBusy("advance");
    try {
      const { data: next } = await supabase
        .from("matches").select("id").eq("status", "scheduled").order("kickoff_at").limit(5);
      if (!next || next.length === 0) { toast.error("No quedan partidos programados"); return; }
      for (const m of next) {
        const score_a = Math.floor(Math.random() * 4);
        const score_b = Math.floor(Math.random() * 4);
        await supabase.from("matches").update({ status: "finished", score_a, score_b, test_mode: true }).eq("id", m.id);
      }
      toast.success(`✅ ${next.length} partidos finalizados con resultado aleatorio`);
      refresh();
    } finally { setBusy(null); }
  }

  async function start3Live() {
    setBusy("live");
    try {
      const { data: next } = await supabase
        .from("matches").select("id").eq("status", "scheduled").order("kickoff_at").limit(3);
      if (!next || next.length === 0) { toast.error("No quedan partidos programados"); return; }
      for (const m of next) {
        await supabase.from("matches").update({ status: "live", score_a: 0, score_b: 0, test_mode: true }).eq("id", m.id);
      }
      toast.success(`⚽ ${next.length} partidos en vivo (0-0)`);
      refresh();
    } finally { setBusy(null); }
  }

  async function goalRain() {
    setBusy("rain");
    try {
      const { data: live } = await supabase.from("matches").select("id, score_a, score_b").eq("status", "live");
      if (!live || live.length === 0) { toast.error("No hay partidos en vivo. Apretá primero 'Poner 3 en vivo'."); return; }
      // 10 ticks each 3 seconds = 30 seconds. Each tick adds a goal to one random team in one random live match.
      for (let i = 0; i < 10; i++) {
        const m = live[Math.floor(Math.random() * live.length)];
        const side: "a" | "b" = Math.random() < 0.5 ? "a" : "b";
        const newA = (m.score_a ?? 0) + (side === "a" ? 1 : 0);
        const newB = (m.score_b ?? 0) + (side === "b" ? 1 : 0);
        await supabase.from("matches").update({ score_a: newA, score_b: newB }).eq("id", m.id);
        if (side === "a") m.score_a = newA; else m.score_b = newB;
        await new Promise((r) => setTimeout(r, 3000));
      }
      toast.success("🎉 Goleada terminada — andá a /live a verla");
      refresh();
    } finally { setBusy(null); }
  }

  async function resetTest() {
    if (!confirm("¿Resetear todos los partidos en modo prueba a 'programado'? No toca los partidos reales.")) return;
    setBusy("reset");
    try {
      const { data: testMatches } = await supabase.from("matches").select("id").eq("test_mode", true);
      if (!testMatches || testMatches.length === 0) { toast.info("Nada que resetear"); return; }
      for (const m of testMatches) {
        await supabase.from("matches").update({ status: "scheduled", score_a: null, score_b: null, test_mode: false }).eq("id", m.id);
      }
      toast.success(`↩️ ${testMatches.length} partidos reseteados`);
      refresh();
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <Card className="border-yellow-500/40 bg-yellow-500/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-yellow-600" /> Simulador masivo (con los 100 usuarios test)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="rounded border bg-background p-2"><div className="text-xs text-muted-foreground">Usuarios test</div><div className="text-lg font-bold">{stats?.testUsers ?? "…"}</div></div>
            <div className="rounded border bg-background p-2"><div className="text-xs text-muted-foreground">Usuarios reales</div><div className="text-lg font-bold">{stats?.realUsers ?? "…"}</div></div>
            <div className="rounded border bg-background p-2"><div className="text-xs text-muted-foreground">Partidos</div><div className="text-sm font-bold">{stats?.finished ?? "…"} fin · {stats?.live ?? "…"} live · {stats?.scheduled ?? "…"} prog</div></div>
            <div className="rounded border bg-background p-2"><div className="text-xs text-muted-foreground">Pronósticos cargados</div><div className="text-lg font-bold">{stats?.predictions?.toLocaleString() ?? "…"}</div></div>
          </div>

          <div className="grid sm:grid-cols-2 gap-2">
            <Button onClick={advance5} disabled={busy !== null} className="h-auto py-3 justify-start" variant="default">
              <FastForward className="h-5 w-5 mr-3" />
              <div className="text-left">
                <div className="font-semibold">Avanzar 5 partidos</div>
                <div className="text-xs opacity-80 font-normal">Finaliza los próximos 5 con resultado aleatorio</div>
              </div>
              {busy === "advance" && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
            </Button>
            <Button onClick={start3Live} disabled={busy !== null} className="h-auto py-3 justify-start" variant="default">
              <Play className="h-5 w-5 mr-3" />
              <div className="text-left">
                <div className="font-semibold">Poner 3 partidos en vivo</div>
                <div className="text-xs opacity-80 font-normal">Marca 3 próximos como en vivo (0-0)</div>
              </div>
              {busy === "live" && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
            </Button>
            <Button onClick={goalRain} disabled={busy !== null} className="h-auto py-3 justify-start" variant="secondary">
              <Zap className="h-5 w-5 mr-3" />
              <div className="text-left">
                <div className="font-semibold">Goleada en vivo (30s)</div>
                <div className="text-xs opacity-80 font-normal">Sumá goles cada 3s · andá a /live a mirar</div>
              </div>
              {busy === "rain" && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
            </Button>
            <Button onClick={resetTest} disabled={busy !== null} className="h-auto py-3 justify-start" variant="outline">
              <RotateCcw className="h-5 w-5 mr-3" />
              <div className="text-left">
                <div className="font-semibold">Reset total prueba</div>
                <div className="text-xs opacity-80 font-normal">Vuelve los partidos test a 'programado'</div>
              </div>
              {busy === "reset" && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-500/40 bg-blue-500/5">
        <CardHeader><CardTitle className="text-base">✅ Cómo verificar</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="list-decimal list-inside space-y-1.5">
            <li>Abrí <a href="/ranking" target="_blank" rel="noreferrer" className="text-primary underline">/ranking</a> en otra pestaña → debería liderar <strong>Test User 092</strong> o similar con ~28 pts.</li>
            <li>Apretá <strong>"Avanzar 5 partidos"</strong> y volvé a /ranking → vas a ver el orden cambiando.</li>
            <li>Andá a <a href="/" target="_blank" rel="noreferrer" className="text-primary underline">/ (Resumen)</a> → el Top 5 debe coincidir EXACTO con el ranking.</li>
            <li>Apretá <strong>"Poner 3 partidos en vivo"</strong> + <strong>"Goleada en vivo"</strong>, abrí <a href="/live" target="_blank" rel="noreferrer" className="text-primary underline">/live</a> y mirá los marcadores y puntos parciales.</li>
            <li>Tab <strong>"Pronósticos"</strong> → elegí "Test User 092" y verificá que ves sus 104 pronósticos con puntos.</li>
            <li>Cuando termines de probar, apretá <strong>"Reset total prueba"</strong> para dejar los partidos limpios.</li>
          </ol>
          <div className="mt-3 p-2 rounded bg-background border text-xs">
            <div className="font-semibold mb-1">Credenciales de los usuarios de prueba (por si querés loguearte como uno):</div>
            <div className="font-mono">test001@prode.test … test100@prode.test</div>
            <div className="font-mono">contraseña: <strong>Prode2026!</strong></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

