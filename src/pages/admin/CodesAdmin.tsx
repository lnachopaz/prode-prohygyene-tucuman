import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export function CodesAdmin() {
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
