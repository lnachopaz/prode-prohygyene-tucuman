import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";

export default function Admin() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Panel admin</h1>
        <p className="text-muted-foreground">Gestioná partidos, usuarios y códigos.</p>
      </div>

      <Tabs defaultValue="matches">
        <TabsList>
          <TabsTrigger value="matches">Partidos</TabsTrigger>
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="codes">Códigos admin</TabsTrigger>
        </TabsList>
        <TabsContent value="matches" className="mt-4"><MatchesAdmin /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersAdmin /></TabsContent>
        <TabsContent value="codes" className="mt-4"><CodesAdmin /></TabsContent>
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
    const { data, error } = await supabase.functions.invoke("sync-matches");
    setSyncing(false);
    if (error) return toast.error(error.message);
    toast.success((data as any)?.message ?? "Sincronizado");
    qc.invalidateQueries({ queryKey: ["admin-matches"] });
    qc.invalidateQueries({ queryKey: ["matches"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={syncFromApi} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sincronizar desde TheSportsDB
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

  return (
    <Card>
      <CardContent className="p-3 grid gap-3 sm:grid-cols-[1fr_auto] items-center">
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
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={remove}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
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
      const [{ data: profiles, error }, { data: roles }, { data: lb }, emailsRes] = await Promise.all([
        supabase.from("profiles").select("*").order("display_name"),
        supabase.from("user_roles").select("*"),
        supabase.from("leaderboard").select("user_id, total_points, predictions_count").order("total_points", { ascending: false }),
        supabase.functions.invoke("admin-users", { body: { action: "list_users" } }),
      ]);
      if (error) throw error;
      const emails: Record<string, string> = (emailsRes.data as any)?.emails ?? {};
      const rankMap = new Map<string, { rank: number; points: number; count: number }>();
      (lb ?? []).forEach((row: any, i: number) => {
        rankMap.set(row.user_id, { rank: i + 1, points: row.total_points, count: row.predictions_count });
      });
      return profiles.map((p) => ({
        ...p,
        email: emails[p.id] ?? "",
        is_admin: roles?.some((r) => r.user_id === p.id && r.role === "admin") ?? false,
        rank: rankMap.get(p.id)?.rank ?? null,
        points: rankMap.get(p.id)?.points ?? 0,
        predictions_count: rankMap.get(p.id)?.count ?? 0,
      }));
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
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "update_status", user_id: userId, status },
    });
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error ?? error?.message ?? "No se pudo actualizar el estado");
    }
    toast.success(status === "approved" ? "Usuario aprobado" : status === "rejected" ? "Usuario rechazado" : "Marcado como pendiente");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  async function deleteUser(userId: string, name: string) {
    if (!confirm(`¿Eliminar definitivamente a ${name}? Esta acción no se puede deshacer y borrará sus pronósticos.`)) return;
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "delete_user", user_id: userId },
    });
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error ?? error?.message ?? "Error eliminando");
    }
    toast.success("Usuario eliminado");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["leaderboard"] });
  }

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  const pending = users?.filter((u: any) => u.status === "pending") ?? [];
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
          pending.map((u: any) => (
            <Card key={u.id}>
              <CardContent className="p-3 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-medium">{u.display_name}</p>
                  {u.email && <p className="text-xs text-muted-foreground">{u.email}</p>}
                  <p className="text-xs text-muted-foreground">Solicitado: {format(new Date(u.created_at), "dd/MM/yyyy HH:mm")}</p>
                </div>
                <Button size="sm" onClick={() => setStatus(u.id, "approved")}>Aprobar</Button>
                <Button size="sm" variant="destructive" onClick={() => setStatus(u.id, "rejected")}>Rechazar</Button>
                <Button size="sm" variant="ghost" onClick={() => deleteUser(u.id, u.display_name)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
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
            onDelete={() => deleteUser(u.id, u.display_name)}
          />
        ))}
      </div>
    </div>
  );
}

function UserRow({ user, onRename, onToggleAdmin, onReject, onDelete }: any) {
  const [name, setName] = useState(user.display_name);
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
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
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {user.email && <span>📧 {user.email}</span>}
          <span>🏆 {user.rank ? `#${user.rank}` : "—"}</span>
          <span>⭐ {user.points} pts</span>
          <span>📝 {user.predictions_count} pronósticos</span>
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
