import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchesAdmin } from "./admin/MatchesAdmin";
import { UsersAdmin } from "./admin/UsersAdmin";
import { PredictionsAdmin } from "./admin/PredictionsAdmin";
import { CodesAdmin } from "./admin/CodesAdmin";
import { SyncAdmin } from "./admin/SyncAdmin";

export default function Admin() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Panel admin</h1>
        <p className="text-muted-foreground">Gestioná partidos, usuarios, sync y exportes.</p>
      </div>

      <Tabs defaultValue="matches">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="matches">Partidos</TabsTrigger>
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="predictions">Pronósticos</TabsTrigger>
          <TabsTrigger value="codes">Códigos admin</TabsTrigger>
          <TabsTrigger value="sync">Sync &amp; Export</TabsTrigger>
        </TabsList>
        <TabsContent value="matches" className="mt-4"><MatchesAdmin /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersAdmin /></TabsContent>
        <TabsContent value="predictions" className="mt-4"><PredictionsAdmin /></TabsContent>
        <TabsContent value="codes" className="mt-4"><CodesAdmin /></TabsContent>
        <TabsContent value="sync" className="mt-4"><SyncAdmin /></TabsContent>
      </Tabs>
    </div>
  );
}
