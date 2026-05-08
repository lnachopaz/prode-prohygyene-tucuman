import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { Loader2, RefreshCw, FileDown, FileText, Zap } from "lucide-react";
import { format, formatDistanceStrict } from "date-fns";
import { es } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function SyncAdmin() {
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

  const [syncingLive, setSyncingLive] = useState(false);
  const [syncingFinal, setSyncingFinal] = useState(false);

  async function runLiveSync() {
    setSyncingLive(true);
    const { error } = await supabase.functions.invoke("sync-live-matches");
    setSyncingLive(false);
    if (error) return toast.error(error.message);
    toast.success("Sync en vivo ejecutado");
    qc.invalidateQueries({ queryKey: ["sync-logs"] });
  }

  async function runSync() {
    setSyncingFinal(true);
    const { error } = await supabase.functions.invoke("finalize-finished-matches");
    setSyncingFinal(false);
    if (error) return toast.error(error.message);
    toast.success("Finalización ejecutada");
    qc.invalidateQueries({ queryKey: ["sync-logs"] });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Sincronización automática
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            El sistema sincroniza automáticamente cada <strong>5 minutos</strong> el estado en vivo y cada <strong>10 minutos</strong> los resultados finales.
            Los botones son para forzar una actualización inmediata si hace falta.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={runLiveSync} disabled={syncingLive || syncingFinal}>
              {syncingLive ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Sync en vivo ahora
            </Button>
            <Button size="sm" onClick={runSync} disabled={syncingLive || syncingFinal}>
              {syncingFinal ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Forzar finalización ahora
            </Button>
          </div>

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

function BackupAllPredictions() {
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);

  async function run(kind: "csv" | "pdf") {
    setBusy(kind);
    try {
      const mod = await import("@/lib/predictionsExport");
      const { rows, displayNameById } = await mod.fetchAllPredictionsWithProfiles();
      if (rows.length === 0) {
        toast.info("Aún no hay pronósticos cargados");
        return;
      }
      if (kind === "csv") mod.exportAllPredictionsCSV(rows, displayNameById);
      else mod.exportAllPredictionsPDF(rows, displayNameById);
      toast.success(`Backup ${kind.toUpperCase()} descargado (${rows.length} registros)`);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo generar el backup");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileDown className="h-4 w-4" /> Backup completo de pronósticos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Descarga todos los pronósticos de todos los usuarios con el resultado real y los puntos obtenidos.
          Útil como copia de seguridad antes/después de cada fecha.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => run("csv")} disabled={busy !== null}>
            {busy === "csv" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
            Backup CSV
          </Button>
          <Button variant="outline" onClick={() => run("pdf")} disabled={busy !== null}>
            {busy === "pdf" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Backup PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ExportRanking() {
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);

  async function loadRanking() {
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
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
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
