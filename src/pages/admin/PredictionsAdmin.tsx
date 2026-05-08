import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, FileDown, Lock, Search, Eye } from "lucide-react";
import { format } from "date-fns";
import { formatAR } from "@/lib/datetime";
import { translateTeamName } from "@/lib/teamNames";

export function PredictionsAdmin() {
  const qc = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { a: string; b: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

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
  const totalPts = Math.round(finished.reduce((s, r) => s + (Number(r.points) || 0), 0) * 10) / 10;
  const exactos = finished.filter((r) => r.match.score_a != null && r.pred_a === r.match.score_a && r.pred_b === r.match.score_b).length;
  const aciertos = finished.filter((r) => {
    const m = r.match;
    if (m.score_a == null) return false;
    if (r.pred_a === m.score_a && r.pred_b === m.score_b) return false;
    return Math.sign(r.pred_a - r.pred_b) === Math.sign(m.score_a - m.score_b);
  }).length;
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
        `"${translateTeamName(m.team_a)} vs ${translateTeamName(m.team_b)}"`,
        `${r.pred_a}-${r.pred_b}`,
        realScore,
        m.status,
        r.points ?? 0,
      ].join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
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
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Puntos</div><div className="text-2xl font-bold">{totalPts.toFixed(1)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Plenos</div><div className="text-2xl font-bold text-success">{exactos}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Resultado</div><div className="text-2xl font-bold text-warning">{aciertos}</div></CardContent></Card>
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

          <Card className={editMode ? "border-destructive" : ""}>
            <CardContent className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Lock className={`h-4 w-4 shrink-0 ${editMode ? "text-destructive" : "text-muted-foreground"}`} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {editMode ? "Modo edición ACTIVO" : "Modo edición desactivado"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {editMode
                      ? "Estás editando pronósticos de otro usuario. Cualquier cambio se aplica al instante."
                      : "Activá esta opción solo si necesitás corregir pronósticos de otro usuario."}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground hidden sm:inline">Permitir edición</span>
                <Switch
                  checked={editMode}
                  onCheckedChange={(v) => {
                    if (v) {
                      const ok = window.confirm("¿Seguro que querés editar pronósticos de OTRO usuario? Esta acción queda registrada.");
                      if (!ok) return;
                    }
                    setEditMode(v);
                    setDrafts({});
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  <div className={`grid ${editMode ? "grid-cols-[110px_1fr_150px_70px_70px]" : "grid-cols-[120px_1fr_70px_70px_60px]"} gap-2 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase`}>
                    <span>Fecha</span><span>Partido</span><span className="text-center">Pron.</span><span className="text-center">Real</span><span className="text-right">{editMode ? "Acción" : "Pts"}</span>
                  </div>
                  {filtered.map((r) => {
                    const m = r.match;
                    const real = m.score_a != null && m.score_b != null ? `${m.score_a}-${m.score_b}` : "—";
                    const draft = drafts[r.id] ?? { a: String(r.pred_a), b: String(r.pred_b) };
                    const dirty = draft.a !== String(r.pred_a) || draft.b !== String(r.pred_b);

                    async function saveRow() {
                      const pa = parseInt(draft.a, 10);
                      const pb = parseInt(draft.b, 10);
                      if (isNaN(pa) || isNaN(pb) || pa < 0 || pb < 0) return toast.error("Goles inválidos");
                      setSavingId(r.id);
                      const { error } = await supabase
                        .from("predictions")
                        .update({ pred_a: pa, pred_b: pb })
                        .eq("id", r.id);
                      setSavingId(null);
                      if (error) return toast.error(error.message);
                      toast.success("Pronóstico actualizado");
                      qc.invalidateQueries({ queryKey: ["pred-admin-rows", selectedUser] });
                      setDrafts((d) => { const nd = { ...d }; delete nd[r.id]; return nd; });
                    }

                    return (
                      <div key={r.id} className={`grid ${editMode ? "grid-cols-[110px_1fr_150px_70px_70px]" : "grid-cols-[120px_1fr_70px_70px_60px]"} gap-2 px-3 py-2 items-center text-sm`}>
                        <div className="text-xs text-muted-foreground">
                          <div>{formatAR(m.kickoff_at, "dd/MM HH:mm")}</div>
                          <div className="text-[10px]">{m.stage}</div>
                        </div>
                        <div className="font-medium truncate">{translateTeamName(m.team_a)} vs {translateTeamName(m.team_b)}</div>
                        {editMode ? (
                          <div className="flex items-center gap-1 justify-center">
                            <Input
                              type="number" min={0}
                              className="h-8 w-12 text-center px-1"
                              value={draft.a}
                              onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: { ...draft, a: e.target.value } }))}
                            />
                            <span className="text-muted-foreground">-</span>
                            <Input
                              type="number" min={0}
                              className="h-8 w-12 text-center px-1"
                              value={draft.b}
                              onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: { ...draft, b: e.target.value } }))}
                            />
                          </div>
                        ) : (
                          <div className="text-center font-mono">{r.pred_a}-{r.pred_b}</div>
                        )}
                        <div className="text-center font-mono text-muted-foreground">{real}</div>
                        <div className="text-right">
                          {editMode ? (
                            <Button
                              size="sm" variant={dirty ? "default" : "ghost"}
                              disabled={!dirty || savingId === r.id}
                              onClick={saveRow}
                            >
                              {savingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            </Button>
                          ) : m.status === "finished" ? (
                            <span className={`font-bold ${Number(r.points) > 1 ? "text-success" : Number(r.points) > 0 ? "text-warning" : "text-muted-foreground"}`}>
                              {Number(r.points ?? 0).toFixed(1)}
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
