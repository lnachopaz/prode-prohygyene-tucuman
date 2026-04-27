import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_points: number;
  exact_hits: number;
  result_hits: number;
  predictions_count: number;
};

export default function Ranking() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leaderboard")
        .select("*")
        .order("total_points", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Trophy className="h-7 w-7 text-primary" /> Ranking
        </h1>
        <p className="text-muted-foreground">3 pts por marcador exacto · 1 pt por acertar el resultado</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            <div className="grid grid-cols-[40px_1fr_60px_60px_70px] gap-3 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">
              <span>#</span>
              <span>Jugador</span>
              <span className="text-center">Exact.</span>
              <span className="text-center">Result.</span>
              <span className="text-right">Total</span>
            </div>
            {data?.map((row, i) => {
              const isMe = row.user_id === user?.id;
              return (
                <div
                  key={row.user_id}
                  className={cn(
                    "grid grid-cols-[40px_1fr_60px_60px_70px] gap-3 px-4 py-3 items-center text-sm",
                    isMe && "bg-primary/5",
                  )}
                >
                  <span className={cn(
                    "font-bold text-lg",
                    i === 0 && "text-warning",
                    i === 1 && "text-muted-foreground",
                    i === 2 && "text-amber-700",
                  )}>{i + 1}</span>
                  <span className="font-medium truncate flex items-center gap-2">
                    {row.display_name} {isMe && <span className="text-xs text-primary">(vos)</span>}
                  </span>
                  <span className="text-center text-success font-semibold">{row.exact_hits}</span>
                  <span className="text-center text-warning font-semibold">{row.result_hits}</span>
                  <span className="text-right font-bold text-lg">{row.total_points}</span>
                </div>
              );
            })}
            {data?.length === 0 && (
              <div className="px-4 py-12 text-center text-muted-foreground text-sm">Aún no hay puntos.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
