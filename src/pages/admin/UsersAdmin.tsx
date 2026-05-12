import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, MailCheck, PlusCircle, MinusCircle } from "lucide-react";
import { format } from "date-fns";

interface AdminUser {
  id: string;
  display_name: string;
  email: string;
  is_admin: boolean;
  is_blocked: boolean;
  status: string;
  rank: number | null;
  total_points: number;
  predictions_count: number;
  show_in_ranking: boolean;
  bonus_points: number;
}

interface UserRowProps {
  user: AdminUser;
  onRename: (name: string) => void;
  onReject: () => void;
  onUnblock: () => void;
  onDelete: () => void;
  onBlock: () => void;
  onToggleRanking: (show: boolean) => void;
  onAdjustPoints: (delta: number) => void;
}

export function UsersAdmin() {
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
    if (status === "approved") {
      supabase.functions.invoke("send-approval-email", { body: { user_id: userId } })
        .then(({ error: fnErr }) => {
          if (fnErr) toast.error(`Email de bienvenida no enviado: ${fnErr.message}`);
          else toast.success("Email de bienvenida enviado");
        });
    }
  }

  async function deleteUser(userId: string, displayName: string) {
    if (!confirm(`¿Eliminar definitivamente a "${displayName}"? Se borrarán todos sus datos (pronósticos, perfil y cuenta). El email quedará libre para registrarse de nuevo.`)) return;
    const { error } = await supabase.rpc("delete_user_completely", { _user_id: userId });
    if (error) return toast.error(error.message);
    toast.success("Usuario eliminado");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-pending-detailed"] });
  }

  async function adjustBonusPoints(userId: string, delta: number) {
    const user = users?.find((u: any) => u.id === userId);
    const current = (user as any)?.bonus_points ?? 0;
    const newVal = current + delta;
    const { error } = await supabase.from("profiles").update({ bonus_points: newVal }).eq("id", userId);
    if (error) return toast.error(error.message);
    toast.success(`${delta > 0 ? "+" : ""}${delta} pts aplicados a ${user?.display_name}`);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["ranking-leaderboard"] });
    qc.invalidateQueries({ queryKey: ["ranking-profiles"] });
  }

  async function toggleRanking(userId: string, show: boolean) {
    const { error } = await supabase.from("profiles").update({ show_in_ranking: show }).eq("id", userId);
    if (error) return toast.error(error.message);
    toast.success(show ? "Usuario visible en el ranking" : "Usuario oculto del ranking");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["ranking-leaderboard"] });
    qc.invalidateQueries({ queryKey: ["ranking-profiles"] });
  }

  async function setBlocked(userId: string, blocked: boolean, displayName: string) {
    if (blocked && !confirm(`¿Bloquear a "${displayName}"? No podrá ingresar al prode hasta desbloquearlo.`)) return;
    const { error } = await supabase.rpc("set_user_blocked", { _user_id: userId, _blocked: blocked });
    if (error) return toast.error(error.message);
    toast.success(blocked ? "Usuario bloqueado" : "Usuario desbloqueado");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
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
            onBlock={() => setBlocked(u.id, !u.is_blocked, u.display_name)}
            onToggleRanking={(show) => toggleRanking(u.id, show)}
            onAdjustPoints={(delta) => adjustBonusPoints(u.id, delta)}
          />
        ))}
      </div>
    </div>
  );
}

function UserRow({ user, onRename, onReject, onUnblock, onDelete, onBlock, onToggleRanking, onAdjustPoints }: UserRowProps) {
  const [name, setName] = useState(user.display_name);
  const [pointDelta, setPointDelta] = useState("");

  function applyDelta() {
    const delta = parseInt(pointDelta);
    if (isNaN(delta) || delta === 0) return;
    onAdjustPoints(delta);
    setPointDelta("");
  }

  return (
    <Card className={user.is_blocked ? "border-destructive/50" : ""}>
      <CardContent className="p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="flex-1 min-w-[180px]" value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="sm" variant="outline" onClick={() => onRename(name)}>Guardar</Button>
          {user.is_admin && <Badge>Admin</Badge>}
          {user.is_blocked && <Badge variant="destructive">🔒 Bloqueado</Badge>}
          {user.status === "rejected" && <Badge variant="destructive">Rechazado</Badge>}
          {user.status === "approved" && !user.is_admin && (
            <Button size="sm" variant="ghost" onClick={onReject}>Rechazar</Button>
          )}
          {user.status === "rejected" && (
            <Button size="sm" onClick={onUnblock}>Aprobar</Button>
          )}
          <Button size="sm" variant={user.is_blocked ? "default" : "outline"} onClick={onBlock}>
            {user.is_blocked ? "Desbloquear" : "Bloquear"}
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>Eliminar</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>📧 {user.email || "—"}</span>
          <Badge variant="outline">
            {user.rank ? `#${user.rank} en ranking` : "Sin ranking"}
            {user.rank ? ` · ${user.total_points} pts` : ""}
          </Badge>
          <Badge variant="outline">{user.predictions_count} pronósticos</Badge>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <Switch
              checked={user.show_in_ranking ?? true}
              onCheckedChange={onToggleRanking}
            />
            <span>Visible en ranking</span>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          <span className="text-xs text-muted-foreground font-medium">Ajuste manual de puntos:</span>
          {(user.bonus_points ?? 0) !== 0 && (
            <Badge variant="outline" className={(user.bonus_points ?? 0) > 0 ? "text-green-600 border-green-400" : "text-red-600 border-red-400"}>
              {(user.bonus_points ?? 0) > 0 ? `+${user.bonus_points}` : user.bonus_points} pts bonus
            </Badge>
          )}
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => { setPointDelta((v) => String((parseInt(v) || 0) - 1)); }}>
              <MinusCircle className="h-3.5 w-3.5" />
            </Button>
            <Input
              type="number"
              className="w-20 h-7 text-xs text-center"
              placeholder="0"
              value={pointDelta}
              onChange={(e) => setPointDelta(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyDelta()}
            />
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => { setPointDelta((v) => String((parseInt(v) || 0) + 1)); }}>
              <PlusCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button size="sm" className="h-7 text-xs" variant="outline" onClick={applyDelta} disabled={pointDelta === "" || parseInt(pointDelta) === 0}>
            Aplicar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
