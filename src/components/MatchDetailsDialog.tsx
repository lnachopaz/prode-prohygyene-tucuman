import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3, Loader2, MapPin, Calendar } from "lucide-react";
import { formatAR } from "@/lib/datetime";
import { getCountryFlagUrl } from "@/lib/countryFlags";
import { formatPoints } from "@/lib/formatPoints";

type MatchDetails = {
  id: string;
  team_a: string;
  team_b: string;
  team_a_flag: string | null;
  team_b_flag: string | null;
  score_a: number | null;
  score_b: number | null;
  stage: string;
  group_name: string | null;
  kickoff_at: string;
  venue?: string | null;
};

type DialogProps = {
  match: MatchDetails;
  /** Si true, oculta el resultado real y los puntos (estados ABIERTO/CERRADO/EN JUEGO). */
  hideRealScore?: boolean;
  /** Texto del botón disparador. */
  triggerLabel?: string;
};

type PredRow = {
  user_id: string;
  pred_a: number;
  pred_b: number;
  points: number;
  display_name: string;
};

export function MatchDetailsDialog({ match, hideRealScore = false, triggerLabel = "Ver detalles" }: DialogProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["match-details", match.id],
    queryFn: async () => {
      const { data: predictions, error } = await supabase
        .from("predictions")
        .select("user_id, pred_a, pred_b, points")
        .eq("match_id", match.id);
      if (error) throw error;

      if (!predictions || predictions.length === 0) return [] as PredRow[];

      const userIds = predictions.map((p) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);

      const nameMap = new Map<string, string>();
      profiles?.forEach((p) => nameMap.set(p.id, p.display_name));

      return predictions
        .map((p) => ({
          ...p,
          display_name: nameMap.get(p.user_id) ?? "—",
        }))
        .sort((a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name)) as PredRow[];
    },
  });

  const flagA = getCountryFlagUrl(match.team_a) ?? match.team_a_flag;
  const flagB = getCountryFlagUrl(match.team_b) ?? match.team_b_flag;

  // Distribución de pronósticos (qué resultado salió más)
  const distribution = (() => {
    if (!data || data.length === 0) return [] as { label: string; count: number; pct: number }[];
    const map = new Map<string, number>();
    data.forEach((p) => {
      const key = `${p.pred_a}-${p.pred_b}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    const total = data.length;
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  })();

  const hits = data?.filter((p) => p.pred_a === match.score_a && p.pred_b === match.score_b).length ?? 0;
  const partial = data?.filter((p) => !(p.pred_a === match.score_a && p.pred_b === match.score_b) && Number(p.points) > 0).length ?? 0;
  const wrong = data?.filter((p) => Number(p.points) === 0).length ?? 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <BarChart3 className="h-4 w-4 mr-2" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalles del partido</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resultado */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-xs text-muted-foreground mb-2 text-center">
              {match.stage}{match.group_name ? ` · ${match.group_name}` : ""}
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex items-center gap-2 justify-end min-w-0">
                <span className="font-semibold truncate">{match.team_a}</span>
                {flagA && <img src={flagA} alt={match.team_a} className="h-8 w-8 rounded-full object-cover" />}
              </div>
              <div className="text-3xl font-bold tabular-nums">
                {hideRealScore ? "-" : (match.score_a ?? "-")} <span className="text-muted-foreground">:</span> {hideRealScore ? "-" : (match.score_b ?? "-")}
              </div>
              <div className="flex items-center gap-2 justify-start min-w-0">
                {flagB && <img src={flagB} alt={match.team_b} className="h-8 w-8 rounded-full object-cover" />}
                <span className="font-semibold truncate">{match.team_b}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {formatAR(match.kickoff_at, "dd/MM/yyyy HH:mm 'hs'")}
              </span>
              {match.venue && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {match.venue}
                </span>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : !data || data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nadie cargó pronósticos para este partido.
            </div>
          ) : (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-bold text-success">{hits}</div>
                  <div className="text-xs text-muted-foreground">Aciertos exactos</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-bold text-warning">{partial}</div>
                  <div className="text-xs text-muted-foreground">Resultado correcto</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-bold text-muted-foreground">{wrong}</div>
                  <div className="text-xs text-muted-foreground">Sin puntos</div>
                </div>
              </div>

              {/* Distribución */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Marcadores más pronosticados</h3>
                <div className="space-y-1.5">
                  {distribution.map((d) => (
                    <div key={d.label} className="flex items-center gap-2 text-sm">
                      <span className="w-12 font-mono font-semibold tabular-nums">{d.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${d.pct}%` }} />
                      </div>
                      <span className="w-16 text-right text-muted-foreground text-xs">
                        {d.count} ({d.pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabla de pronósticos */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Pronósticos de los participantes</h3>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuario</TableHead>
                        <TableHead className="text-center">Pronóstico</TableHead>
                        <TableHead className="text-right">Puntos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((p) => (
                        <TableRow key={p.user_id}>
                          <TableCell className="font-medium">{p.display_name}</TableCell>
                          <TableCell className="text-center font-mono tabular-nums">
                            {p.pred_a} - {p.pred_b}
                          </TableCell>
                          <TableCell className="text-right">
                            {(() => {
                              const isExact = p.pred_a === match.score_a && p.pred_b === match.score_b;
                              const hasPts = Number(p.points) > 0;
                              return (
                                <Badge
                                  variant={isExact ? "default" : hasPts ? "secondary" : "outline"}
                                  className={
                                    isExact
                                      ? "bg-success text-success-foreground hover:bg-success"
                                      : hasPts
                                      ? "bg-warning text-warning-foreground hover:bg-warning"
                                      : ""
                                  }
                                >
                                  +{formatPoints(p.points)}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
