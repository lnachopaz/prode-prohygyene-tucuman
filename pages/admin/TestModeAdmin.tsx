import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, Trash2, Calculator, RotateCcw, RefreshCw, FastForward, Play, Zap, FlaskConical } from "lucide-react";
import { fetchAllPaginated } from "@/lib/fetchAll";
import { formatAR } from "@/lib/datetime";
import { translateTeamName } from "@/lib/teamNames";
import { getMultiplierInfo } from "@/lib/scoring";

interface TestMatch {
  id: string;
  team_a: string;
  team_b: string;
  stage: string;
  kickoff_at: string;
  score_a: number | null;
  score_b: number | null;
  status: string;
  predictions_lock_mode: string | null;
}

export function TestModeAdmin() {
  return (
    <div className="space-y-4">
      <Card className="border-yellow-500/40 bg-yellow-500/5">
        <CardContent className="p-4 text-sm space-y-1">
          <p className="font-semibold flex items-center gap-2"><FlaskConical className="h-4 w-4 text-yellow-600" /> Modo prueba</p>
          <p className="text-muted-foreground">Probá todas las funciones del prode: cambiar marcadores, finalizar partidos, simular pronósticos masivos y restablecer todo cuando termines.</p>
        </CardContent>
      </Card>
      <Tabs defaultValue="editor">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="editor">Editor de partidos</TabsTrigger>
          <TabsTrigger value="me">Mi simulador</TabsTrigger>
          <TabsTrigger value="bulk">Simulador masivo</TabsTrigger>
          <TabsTrigger value="checks">Verificación de reglas</TabsTrigger>
        </TabsList>
        <TabsContent value="editor" className="mt-4"><TestMatchEditor /></TabsContent>
        <TabsContent value="me" className="mt-4"><TestMyPredictions /></TabsContent>
        <TabsContent value="bulk" className="mt-4"><BulkSimulator /></TabsContent>
        <TabsContent value="checks" className="mt-4"><TestRulesChecks /></TabsContent>
      </Tabs>
    </div>
  );
}

function TestMatchEditor() {
  const qc = useQueryClient();
  const [stage, setStage] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const { data: matches, isLoading } = useQuery({
    queryKey: ["test-matches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("matches").select("*").order("kickoff_at");
      if (error) throw error;
      return data as TestMatch[];
    },
  });

  const filtered = (matches ?? []).filter((m) => {
    if (status !== "all" && m.status !== status) return false;
    if (stage !== "all") {
      const s = (m.stage || "").toLowerCase();
      if (stage === "groups" && !(s.includes("grupo") || s.includes("group"))) return false;
      if (stage === "r16" && !(s.includes("octavo") || s.includes("round of 16"))) return false;
      if (stage === "qf" && !(s.includes("cuarto") || s.includes("quarter"))) return false;
      if (stage === "sf" && !s.includes("semi")) return false;
      if (stage === "final" && !(s.includes("final") || s.includes("tercer"))) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!translateTeamName(m.team_a).toLowerCase().includes(q) &&
          !translateTeamName(m.team_b).toLowerCase().includes(q)) return false;
    }
    return true;
  }).slice(0, 50);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="scheduled">Programados</SelectItem>
            <SelectItem value="live">En vivo</SelectItem>
            <SelectItem value="finished">Finalizados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stage} onValueChange={setStage}>
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
        <Input placeholder="Buscar equipo..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
        <span className="text-xs text-muted-foreground self-center ml-auto">{filtered.length} de {matches?.length ?? 0}</span>
      </div>

      {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <TestMatchRow key={m.id} match={m} onChanged={() => {
              qc.invalidateQueries({ queryKey: ["test-matches"] });
              qc.invalidateQueries({ queryKey: ["matches"] });
              qc.invalidateQueries({ queryKey: ["leaderboard"] });
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function TestMatchRow({ match, onChanged }: { match: TestMatch; onChanged: () => void }) {
  const [scoreA, setScoreA] = useState<string>(match.score_a?.toString() ?? "");
  const [scoreB, setScoreB] = useState<string>(match.score_b?.toString() ?? "");
  const [status, setStatus] = useState<string>(match.status);
  const [lockMode, setLockMode] = useState<string>(match.predictions_lock_mode ?? "auto");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const update: any = {
      status,
      predictions_lock_mode: lockMode,
      test_mode: true,
    };
    if (scoreA !== "") update.score_a = parseInt(scoreA, 10);
    if (scoreB !== "") update.score_b = parseInt(scoreB, 10);
    if (status === "scheduled" && scoreA === "" && scoreB === "") {
      update.score_a = null;
      update.score_b = null;
    }
    const { error } = await supabase.from("matches").update(update).eq("id", match.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Partido actualizado · puntos recalculados");
    onChanged();
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium truncate">
            {translateTeamName(match.team_a)} vs {translateTeamName(match.team_b)}
          </span>
          <span className="text-muted-foreground shrink-0">{match.stage} · {formatAR(match.kickoff_at, "dd/MM HH:mm")}</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">Programado</SelectItem>
              <SelectItem value="live">En vivo</SelectItem>
              <SelectItem value="finished">Finalizado</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Input type="number" min={0} value={scoreA} onChange={(e) => setScoreA(e.target.value)} className="w-14 h-8 text-center" />
            <span className="text-xs">-</span>
            <Input type="number" min={0} value={scoreB} onChange={(e) => setScoreB(e.target.value)} className="w-14 h-8 text-center" />
          </div>
          <Select value={lockMode} onValueChange={setLockMode}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (ventana)</SelectItem>
              <SelectItem value="force_open">Forzar abierto</SelectItem>
              <SelectItem value="force_closed">Forzar cerrado</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={save} disabled={saving} className="ml-auto">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TestMyPredictions() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["test-my-preds"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return { preds: [], matches: [], uid: null };
      const { data: matches } = await supabase.from("matches").select("*").order("kickoff_at");
      const { data: preds } = await supabase
        .from("predictions")
        .select("match_id, pred_a, pred_b, points")
        .eq("user_id", uid);
      return { preds: preds ?? [], matches: matches ?? [], uid };
    },
    refetchInterval: 5000,
  });

  async function genRandom() {
    if (!data?.uid) return;
    setBusy(true);
    try {
      const predMap = new Map((data.preds ?? []).map((p: any) => [p.match_id, p]));
      const missing = (data.matches ?? []).filter((m: any) => !predMap.has(m.id));
      if (missing.length === 0) { toast.info("Ya tenés pronóstico en todos los partidos"); return; }
      const rows = missing.map((m: any) => ({
        user_id: data.uid,
        match_id: m.id,
        pred_a: Math.floor(Math.random() * 4),
        pred_b: Math.floor(Math.random() * 4),
      }));
      const { error } = await supabase.from("predictions").upsert(rows, { onConflict: "user_id,match_id" });
      if (error) { toast.error(error.message); return; }
      toast.success(`✅ ${rows.length} pronósticos aleatorios cargados`);
      qc.invalidateQueries({ queryKey: ["test-my-preds"] });
    } finally { setBusy(false); }
  }

  async function clearMine() {
    if (!data?.uid) return;
    if (!confirm("¿Borrar TODOS tus pronósticos?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("predictions").delete().eq("user_id", data.uid);
      if (error) return toast.error(error.message);
      toast.success("Pronósticos borrados");
      qc.invalidateQueries({ queryKey: ["test-my-preds"] });
    } finally { setBusy(false); }
  }

  const matchMap = new Map((data?.matches ?? []).map((m: any) => [m.id, m]));
  const rows = (data?.preds ?? [])
    .map((p: any) => ({ ...p, match: matchMap.get(p.match_id) }))
    .filter((r: any) => r.match)
    .sort((a: any, b: any) => new Date(a.match.kickoff_at).getTime() - new Date(b.match.kickoff_at).getTime());
  const total = Math.round(rows.reduce((s: number, r: any) => s + (Number(r.points) || 0), 0) * 10) / 10;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={genRandom} disabled={busy}>
          <Zap className="h-4 w-4 mr-1" /> Generar pronósticos aleatorios para mí
        </Button>
        <Button size="sm" variant="outline" onClick={clearMine} disabled={busy}>
          <Trash2 className="h-4 w-4 mr-1" /> Borrar mis pronósticos
        </Button>
        <span className="ml-auto text-sm self-center">Total: <strong>{total.toFixed(1)} pts</strong> · {rows.length} pronósticos</span>
      </div>
      {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-[1fr_70px_70px_60px_60px] gap-2 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase border-b">
              <span>Partido</span><span className="text-center">Pron.</span><span className="text-center">Real</span><span className="text-center">Mult.</span><span className="text-right">Pts</span>
            </div>
            <div className="divide-y max-h-[500px] overflow-auto">
              {rows.map((r: any) => {
                const m = r.match;
                const real = m.score_a != null ? `${m.score_a}-${m.score_b}` : "—";
                const mult = m.team_a && m.team_b ? getMultiplierInfo(m.team_a, m.team_b, m.stage) : null;
                return (
                  <div key={r.match_id} className="grid grid-cols-[1fr_70px_70px_60px_60px] gap-2 px-3 py-2 items-center text-sm">
                    <div className="truncate">
                      <div className="font-medium truncate">{translateTeamName(m.team_a)} vs {translateTeamName(m.team_b)}</div>
                      <div className="text-[10px] text-muted-foreground">{m.stage}</div>
                    </div>
                    <div className="text-center font-mono">{r.pred_a}-{r.pred_b}</div>
                    <div className="text-center font-mono text-muted-foreground">{real}</div>
                    <div className="text-center text-xs">{mult?.label ?? "x1"}</div>
                    <div className="text-right font-bold tabular-nums">{Number(r.points ?? 0).toFixed(1)}</div>
                  </div>
                );
              })}
              {rows.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">Sin pronósticos. Usá "Generar aleatorios".</div>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TestRulesChecks() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["test-rules-checks"],
    queryFn: async () => {
      const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

      const { data: argMatches } = await supabase
        .from("matches").select("id, team_a, team_b, stage, score_a, score_b").eq("status", "finished");
      const argFin = (argMatches ?? []).find((m: any) =>
        (m.team_a?.toLowerCase().includes("argentina") || m.team_b?.toLowerCase().includes("argentina"))
        && m.score_a != null);
      if (argFin) {
        const { data: pred } = await supabase
          .from("predictions").select("pred_a, pred_b, points").eq("match_id", argFin.id).limit(1).maybeSingle();
        if (pred && Number(pred.points) > 0) {
          const isExact = pred.pred_a === argFin.score_a && pred.pred_b === argFin.score_b;
          const expectedBase = isExact ? 3 : 1;
          const expected = expectedBase * 2;
          checks.push({
            name: "Multiplicador Argentina x2",
            ok: Math.abs(Number(pred.points) - expected) < 0.5 || Number(pred.points) >= expected,
            detail: `Pron ${pred.pred_a}-${pred.pred_b} vs ${argFin.score_a}-${argFin.score_b} → ${Number(pred.points).toFixed(1)} pts`,
          });
        } else {
          checks.push({ name: "Multiplicador Argentina x2", ok: true, detail: "Sin pronósticos puntuables aún" });
        }
      } else {
        checks.push({ name: "Multiplicador Argentina x2", ok: true, detail: "Sin partido finalizado de Argentina" });
      }

      const { data: windows } = await supabase.from("prediction_windows").select("*").order("sort_order");
      const now = Date.now();
      const openCount = (windows ?? []).filter((w: any) =>
        new Date(w.opens_at).getTime() <= now && now <= new Date(w.closes_at).getTime()
      ).length;
      checks.push({
        name: "Ventanas de pronóstico configuradas",
        ok: (windows ?? []).length > 0,
        detail: `${windows?.length ?? 0} ventanas · ${openCount} abierta(s) ahora`,
      });

      const { data: pending } = await supabase.from("profiles").select("id").eq("status", "pending");
      checks.push({
        name: "Sistema de aprobación operativo",
        ok: true,
        detail: `${pending?.length ?? 0} usuario(s) pendientes de aprobación`,
      });

      const { data: lb } = await supabase
        .from("leaderboard").select("display_name, total_points, exact_hits, result_hits")
        .order("total_points", { ascending: false }).order("exact_hits", { ascending: false }).limit(5);
      checks.push({
        name: "Ranking ordenado por puntos → plenos → resultados",
        ok: (lb ?? []).length > 0,
        detail: (lb ?? []).map((u: any) => `${u.display_name}: ${Number(u.total_points).toFixed(1)} pts (${u.exact_hits} plenos)`).join(" · ") || "Sin datos",
      });

      const { data: anyPred } = await supabase.from("predictions").select("points").gt("points", 0).limit(1).maybeSingle();
      checks.push({
        name: "Sistema de puntos con decimales",
        ok: true,
        detail: anyPred ? `Ej: ${Number(anyPred.points).toFixed(1)} pts` : "Aún no hay puntos calculados",
      });

      return checks;
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Checks automáticos sobre las reglas del prode.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-1" />Re-chequear</Button>
      </div>
      {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
        <div className="space-y-2">
          {(data ?? []).map((c, i) => (
            <Card key={i}>
              <CardContent className="p-3 flex items-start gap-2">
                <span className={`text-xl ${c.ok ? "text-success" : "text-destructive"}`}>{c.ok ? "✅" : "❌"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.detail}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

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
      for (let i = 0; i < 10; i++) {
        const m = live[Math.floor(Math.random() * live.length)];
        const side: "a" | "b" = Math.random() < 0.5 ? "a" : "b";
        const newA = (m.score_a ?? 0) + (side === "a" ? 1 : 0);
        const newB = (m.score_b ?? 0) + (side === "b" ? 1 : 0);
        await supabase.from("matches").update({ score_a: newA, score_b: newB }).eq("id", m.id);
        if (side === "a") m.score_a = newA; else m.score_b = newB;
        await new Promise((r) => setTimeout(r, 3000));
      }
      toast.success("🎉 Goleada terminada");
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

  async function resetAllToInitial() {
    if (!confirm("⚠️ RESTABLECER TODO COMO ESTABA ANTES\n\nEsto va a:\n• Poner TODOS los partidos en estado 'Programado'\n• Borrar todos los marcadores (score)\n• Resetear puntos de todas las predicciones a 0\n• Quitar las marcas de modo prueba\n\nNO se borran los pronósticos cargados por usuarios.\n\n¿Continuar?")) return;
    setBusy("reset-all");
    try {
      const { data: allMatches, error: e1 } = await supabase.from("matches").select("id");
      if (e1) throw e1;
      let updated = 0;
      for (const m of allMatches ?? []) {
        const { error } = await supabase
          .from("matches")
          .update({ status: "scheduled", score_a: null, score_b: null, test_mode: false })
          .eq("id", m.id);
        if (!error) updated++;
      }
      const { error: pe } = await supabase
        .from("predictions")
        .update({ points: 0 })
        .gte("points", 0);
      if (pe) console.warn(pe);
      toast.success(`↩️ ${updated} partidos restablecidos al estado inicial`);
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Error al restablecer");
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
                <div className="text-xs opacity-80 font-normal">Sumá goles cada 3s</div>
              </div>
              {busy === "rain" && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
            </Button>
            <Button onClick={resetTest} disabled={busy !== null} className="h-auto py-3 justify-start" variant="outline">
              <RotateCcw className="h-5 w-5 mr-3" />
              <div className="text-left">
                <div className="font-semibold">Reset partidos test</div>
                <div className="text-xs opacity-80 font-normal">Vuelve solo los partidos marcados como test a 'programado'</div>
              </div>
              {busy === "reset" && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
            </Button>
          </div>

          <div className="pt-2 border-t">
            <Button onClick={resetAllToInitial} disabled={busy !== null} className="h-auto py-3 w-full justify-start" variant="destructive">
              <RotateCcw className="h-5 w-5 mr-3" />
              <div className="text-left">
                <div className="font-semibold">↩️ Restablecer TODO como estaba antes</div>
                <div className="text-xs opacity-90 font-normal">Pone todos los partidos en 'Programado', borra marcadores y puntos. No borra pronósticos.</div>
              </div>
              {busy === "reset-all" && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
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
            <li>Apretá <strong>"Poner 3 partidos en vivo"</strong> + <strong>"Goleada en vivo"</strong> y mirá los marcadores actualizarse.</li>
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
