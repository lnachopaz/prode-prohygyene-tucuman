import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, FileDown, FileText } from "lucide-react";
import {
  fetchUserPredictions,
  exportUserPredictionsCSV,
  exportUserPredictionsPDF,
} from "@/lib/predictionsExport";
import { TournamentRules } from "@/components/TournamentRules";

export default function Profile() {
  const { user, isAdmin } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

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
        .select("points, match:matches(status, score_a, score_b)")
        .eq("user_id", user!.id);
      if (error) throw error;
      const finished = (data ?? []).filter((r: any) => r.match && (r.match.status === "finished" || (r.match.score_a != null && r.match.score_b != null)));
      const total = finished.reduce((s: number, r: any) => s + (r.points || 0), 0);
      const exact = finished.filter((r: any) => r.points === 3).length;
      const result = finished.filter((r: any) => r.points === 1).length;
      const n = finished.length;
      return {
        total_points: total,
        exact_hits: exact,
        result_hits: result,
        finished: n,
        exact_pct: n ? Math.round((exact / n) * 100) : 0,
        result_pct: n ? Math.round((result / n) * 100) : 0,
        avg: n ? (total / n).toFixed(2) : "0.00",
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
        <StatCard label="Puntos totales" value={stats?.total_points ?? 0} />
        <StatCard label="Plenos" value={stats?.exact_hits ?? 0} />
        <StatCard label="Resultado" value={stats?.result_hits ?? 0} />
        <StatCard label="% Exactos" value={`${stats?.exact_pct ?? 0}%`} />
        <StatCard label="% Resultado" value={`${stats?.result_pct ?? 0}%`} />
        <StatCard label="Prom. / partido" value={stats?.avg ?? "0.00"} />
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
