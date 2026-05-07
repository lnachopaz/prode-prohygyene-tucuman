import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, FileDown, FileText, KeyRound, Eye, EyeOff, Check, X } from "lucide-react";
import {
  fetchUserPredictions,
  exportUserPredictionsCSV,
  exportUserPredictionsPDF,
} from "@/lib/predictionsExport";
import { TournamentRules } from "@/components/TournamentRules";
import { formatPoints } from "@/lib/formatPoints";
import { passwordRules, isPasswordValid } from "@/lib/passwordRules";

export default function Profile() {
  const { user, isAdmin } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  // change password
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);
  const newPwdValid = isPasswordValid(newPwd);
  const newPwdMatches = newPwd.length > 0 && newPwd === confirmPwd;

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPwdValid) return toast.error("La contraseña no cumple los requisitos");
    if (!newPwdMatches) return toast.error("Las contraseñas no coinciden");
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setChangingPwd(false);
    if (error) return toast.error(error.message);
    toast.success("Contraseña actualizada");
    setNewPwd("");
    setConfirmPwd("");
  }

  async function handleExport(kind: "csv" | "pdf") {
    if (!user) return;
    setExporting(kind);
    try {
      const rows = await fetchUserPredictions(user.id);
      if (rows.length === 0) {
        toast.info("Todavía no tenés pronósticos cargados");
        return;
      }
      const name = profile?.display_name || user.email || "usuario";
      if (kind === "csv") exportUserPredictionsCSV(name, rows);
      else exportUserPredictionsPDF(name, rows);
      toast.success(`${kind.toUpperCase()} descargado`);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo exportar");
    } finally {
      setExporting(null);
    }
  }

  const { data: profile, refetch } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["my-stats-detailed", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("points, pred_a, pred_b, match:matches(status, score_a, score_b)")
        .eq("user_id", user!.id);
      if (error) throw error;
      const finished = (data ?? []).filter((r: any) => r.match && (r.match.status === "finished" || (r.match.score_a != null && r.match.score_b != null)));
      const total = finished.reduce((s: number, r: any) => s + Number(r.points || 0), 0);
      const exact = finished.filter((r: any) => r.pred_a === r.match.score_a && r.pred_b === r.match.score_b).length;
      const result = finished.filter((r: any) => !(r.pred_a === r.match.score_a && r.pred_b === r.match.score_b) && Math.sign(r.pred_a - r.pred_b) === Math.sign(r.match.score_a - r.match.score_b)).length;
      const n = finished.length;
      return {
        total_points: total,
        exact_hits: exact,
        result_hits: result,
        finished: n,
        exact_pct: n ? Math.round((exact / n) * 100) : 0,
        result_pct: n ? Math.round((result / n) * 100) : 0,
        avg: n ? (total / n) : 0,
      };
    },
  });

  useEffect(() => {
    if (profile?.display_name) setName(profile.display_name);
  }, [profile]);

  async function handleSave() {
    if (!user || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil actualizado");
    refetch();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Mi perfil</h1>
        <p className="text-muted-foreground">{user?.email}{isAdmin && " · Admin"}</p>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
        <StatCard label="Puntos totales" value={formatPoints(stats?.total_points ?? 0)} />
        <StatCard label="Plenos" value={stats?.exact_hits ?? 0} />
        <StatCard label="Resultado" value={stats?.result_hits ?? 0} />
        <StatCard label="% Exactos" value={`${stats?.exact_pct ?? 0}%`} />
        <StatCard label="% Resultado" value={`${stats?.result_pct ?? 0}%`} />
        <StatCard label="Prom. / partido" value={formatPoints(stats?.avg ?? 0)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Datos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="display">Nombre visible</Label>
            <Input id="display" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" /> Backup de mis pronósticos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Descargá una copia de todos tus pronósticos con el resultado real y los puntos obtenidos.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => handleExport("csv")} disabled={exporting !== null}>
              {exporting === "csv" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
              Descargar CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport("pdf")} disabled={exporting !== null}>
              {exporting === "pdf" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Descargar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Cambiar contraseña
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPwd">Contraseña nueva</Label>
              <div className="relative">
                <Input
                  id="newPwd"
                  type={showNewPwd ? "text" : "password"}
                  required
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showNewPwd ? "Ocultar" : "Mostrar"}
                >
                  {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
                {passwordRules.map((rule) => {
                  const ok = rule.test(newPwd);
                  return (
                    <li key={rule.label} className={`flex items-center gap-2 ${ok ? "text-success" : "text-muted-foreground"}`}>
                      {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      <span>{rule.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPwd">Repetir contraseña</Label>
              <div className="relative">
                <Input
                  id="confirmPwd"
                  type={showConfirmPwd ? "text" : "password"}
                  required
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPwd((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showConfirmPwd ? "Ocultar" : "Mostrar"}
                >
                  {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPwd.length > 0 && (
                <p className={`flex items-center gap-2 text-xs ${newPwdMatches ? "text-success" : "text-destructive"}`}>
                  {newPwdMatches ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  {newPwdMatches ? "Las contraseñas coinciden" : "Las contraseñas no coinciden"}
                </p>
              )}
            </div>
            <Button type="submit" disabled={changingPwd}>
              {changingPwd && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Actualizar contraseña
            </Button>
          </form>
        </CardContent>
      </Card>

      <TournamentRules />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-3xl font-bold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
