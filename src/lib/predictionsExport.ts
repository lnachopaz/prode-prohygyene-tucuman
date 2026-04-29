import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { formatAR } from "@/lib/datetime";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAll";

export type PredictionRow = {
  id: string;
  user_id: string;
  pred_a: number;
  pred_b: number;
  points: number;
  created_at: string;
  updated_at: string;
  match: {
    id: string;
    stage: string;
    group_name: string | null;
    team_a: string;
    team_b: string;
    score_a: number | null;
    score_b: number | null;
    status: string;
    kickoff_at: string;
    venue: string | null;
  } | null;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function resultLabel(p: number) {
  if (p === 3) return "Pleno";
  if (p === 1) return "Resultado";
  return "—";
}

function predStr(a: number | null, b: number | null) {
  if (a == null || b == null) return "—";
  return `${a} - ${b}`;
}

// ---------- Carga ----------

export async function fetchUserPredictions(userId: string): Promise<PredictionRow[]> {
  const { data, error } = await supabase
    .from("predictions")
    .select(
      "id, user_id, pred_a, pred_b, points, created_at, updated_at, match:matches(id, stage, group_name, team_a, team_b, score_a, score_b, status, kickoff_at, venue)",
    )
    .eq("user_id", userId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as PredictionRow[];
  return rows.sort((a, b) => {
    const ta = a.match ? new Date(a.match.kickoff_at).getTime() : 0;
    const tb = b.match ? new Date(b.match.kickoff_at).getTime() : 0;
    return ta - tb;
  });
}

export async function fetchAllPredictionsWithProfiles() {
  const rows = await fetchAllPaginated<PredictionRow>(() =>
    supabase
      .from("predictions")
      .select(
        "id, user_id, pred_a, pred_b, points, created_at, updated_at, match:matches(id, stage, group_name, team_a, team_b, score_a, score_b, status, kickoff_at, venue)",
      )
      .order("user_id", { ascending: true }),
  );
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, display_name");
  if (error) throw error;
  const map = new Map<string, string>(
    (profiles ?? []).map((p: any) => [p.id, p.display_name as string]),
  );
  return { rows, displayNameById: map };
}

// ---------- CSV ----------

export function exportUserPredictionsCSV(displayName: string, rows: PredictionRow[]) {
  const header = [
    "Fecha (AR)",
    "Fase",
    "Grupo",
    "Equipo A",
    "Equipo B",
    "Pronóstico",
    "Resultado real",
    "Estado partido",
    "Puntos",
    "Acierto",
    "Sede",
    "Guardado",
    "Editado",
  ];
  const body = rows.map((r) => {
    const m = r.match;
    return [
      m ? formatAR(m.kickoff_at, "dd/MM/yyyy HH:mm") : "—",
      m?.stage ?? "—",
      m?.group_name ?? "",
      m?.team_a ?? "—",
      m?.team_b ?? "—",
      `${r.pred_a} - ${r.pred_b}`,
      m ? predStr(m.score_a, m.score_b) : "—",
      m?.status ?? "—",
      r.points,
      resultLabel(r.points),
      m?.venue ?? "",
      formatAR(r.created_at, "dd/MM/yyyy HH:mm"),
      formatAR(r.updated_at, "dd/MM/yyyy HH:mm"),
    ].map(csvEscape).join(",");
  });
  const csv = [header.join(","), ...body].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const safe = displayName.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "usuario";
  downloadBlob(blob, `pronosticos-${safe}-${format(new Date(), "yyyyMMdd-HHmm")}.csv`);
}

export function exportAllPredictionsCSV(
  rows: PredictionRow[],
  displayNameById: Map<string, string>,
) {
  const header = [
    "Usuario",
    "Fecha (AR)",
    "Fase",
    "Grupo",
    "Equipo A",
    "Equipo B",
    "Pronóstico",
    "Resultado real",
    "Estado",
    "Puntos",
    "Acierto",
    "Guardado",
    "Editado",
  ];
  const body = rows.map((r) => {
    const m = r.match;
    return [
      displayNameById.get(r.user_id) ?? r.user_id,
      m ? formatAR(m.kickoff_at, "dd/MM/yyyy HH:mm") : "—",
      m?.stage ?? "—",
      m?.group_name ?? "",
      m?.team_a ?? "—",
      m?.team_b ?? "—",
      `${r.pred_a} - ${r.pred_b}`,
      m ? predStr(m.score_a, m.score_b) : "—",
      m?.status ?? "—",
      r.points,
      resultLabel(r.points),
      formatAR(r.created_at, "dd/MM/yyyy HH:mm"),
      formatAR(r.updated_at, "dd/MM/yyyy HH:mm"),
    ].map(csvEscape).join(",");
  });
  const csv = [header.join(","), ...body].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `backup-pronosticos-${format(new Date(), "yyyyMMdd-HHmm")}.csv`);
}

// ---------- PDF ----------

export function exportUserPredictionsPDF(displayName: string, rows: PredictionRow[]) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.text("Mis pronósticos · Mundial 2026", 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Usuario: ${displayName}`, 14, 22);
  doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageW - 14, 22, { align: "right" });

  const finished = rows.filter((r) => r.match && (r.match.status === "finished" || (r.match.score_a != null && r.match.score_b != null)));
  const total = finished.reduce((s, r) => s + (r.points || 0), 0);
  const exact = finished.filter((r) => r.points === 3).length;
  const result = finished.filter((r) => r.points === 1).length;

  doc.setTextColor(20);
  doc.setFontSize(11);
  doc.text(
    `Pronósticos: ${rows.length}  ·  Jugados: ${finished.length}  ·  Plenos: ${exact}  ·  Resultado: ${result}  ·  Puntos: ${total}`,
    14,
    30,
  );

  autoTable(doc, {
    startY: 36,
    head: [["Fecha (AR)", "Fase", "Partido", "Pronóstico", "Real", "Pts"]],
    body: rows.map((r) => {
      const m = r.match;
      return [
        m ? formatAR(m.kickoff_at, "dd/MM HH:mm") : "—",
        m?.stage ?? "—",
        m ? `${m.team_a} vs ${m.team_b}` : "—",
        `${r.pred_a} - ${r.pred_b}`,
        m ? predStr(m.score_a, m.score_b) : "—",
        r.points,
      ];
    }),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 64, 175] },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        const v = Number(data.cell.raw);
        if (v === 3) data.cell.styles.fillColor = [220, 252, 231];
        else if (v === 1) data.cell.styles.fillColor = [254, 249, 195];
      }
    },
  });

  const safe = displayName.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "usuario";
  doc.save(`pronosticos-${safe}-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
}

export function exportAllPredictionsPDF(
  rows: PredictionRow[],
  displayNameById: Map<string, string>,
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.text("Backup de pronósticos · Prode Mundial 2026", 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageW - 14, 22, { align: "right" });
  doc.text(`Total registros: ${rows.length}  ·  Usuarios: ${new Set(rows.map((r) => r.user_id)).size}`, 14, 22);

  // Agrupar por usuario para legibilidad
  const byUser = new Map<string, PredictionRow[]>();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id)!.push(r);
  }
  const users = [...byUser.entries()]
    .map(([uid, list]) => ({
      uid,
      name: displayNameById.get(uid) ?? uid.slice(0, 8),
      list: list.sort((a, b) => {
        const ta = a.match ? new Date(a.match.kickoff_at).getTime() : 0;
        const tb = b.match ? new Date(b.match.kickoff_at).getTime() : 0;
        return ta - tb;
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let first = true;
  for (const u of users) {
    if (!first) doc.addPage();
    first = false;

    const finished = u.list.filter((r) => r.match && (r.match.status === "finished" || (r.match.score_a != null && r.match.score_b != null)));
    const total = finished.reduce((s, r) => s + (r.points || 0), 0);
    const exact = finished.filter((r) => r.points === 3).length;
    const result = finished.filter((r) => r.points === 1).length;

    doc.setFontSize(14);
    doc.setTextColor(20);
    doc.text(u.name, 14, 30);
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(
      `Pronósticos: ${u.list.length}  ·  Jugados: ${finished.length}  ·  Plenos: ${exact}  ·  Resultado: ${result}  ·  Puntos: ${total}`,
      14,
      36,
    );

    autoTable(doc, {
      startY: 40,
      head: [["Fecha (AR)", "Fase", "Equipo A", "Equipo B", "Pron.", "Real", "Pts"]],
      body: u.list.map((r) => {
        const m = r.match;
        return [
          m ? formatAR(m.kickoff_at, "dd/MM HH:mm") : "—",
          m?.stage ?? "—",
          m?.team_a ?? "—",
          m?.team_b ?? "—",
          `${r.pred_a} - ${r.pred_b}`,
          m ? predStr(m.score_a, m.score_b) : "—",
          r.points,
        ];
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 64, 175] },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 6) {
          const v = Number(data.cell.raw);
          if (v === 3) data.cell.styles.fillColor = [220, 252, 231];
          else if (v === 1) data.cell.styles.fillColor = [254, 249, 195];
        }
      },
    });
  }

  doc.save(`backup-pronosticos-${format(new Date(), "yyyyMMdd-HHmm")}.pdf`);
}
