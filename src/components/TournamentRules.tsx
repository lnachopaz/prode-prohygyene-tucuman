import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Calendar, Trophy, Target, Gift, Scale } from "lucide-react";

export function TournamentRules() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" /> Reglas del Prode 2026 Prohygiene
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-primary" /> Carga de pronósticos
          </h3>
          <p className="text-muted-foreground mb-2">
            Los pronósticos se pueden cargar hasta <strong>1 hora antes</strong> de cada partido.
            Las fases se desbloquean progresivamente:
          </p>
          <ul className="space-y-1 text-muted-foreground">
            <li>• <strong>Fecha 1</strong> (fase de grupos): ya disponible</li>
            <li>• <strong>Fecha 2</strong> (fase de grupos): desde el 11/06</li>
            <li>• <strong>Fecha 3</strong> (fase de grupos): desde el 18/06</li>
            <li>• <strong>Dieciseisavos de final</strong>: desde el 24/06</li>
            <li>• <strong>Octavos de final</strong>: desde el 28/06</li>
            <li>• <strong>Cuartos de final</strong>: desde el 04/07</li>
            <li>• <strong>Semifinales</strong>: desde el 09/07</li>
            <li>• <strong>Final y 3°/4° puesto</strong>: desde el 14/07</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2 italic">
            Una vez vencido el plazo o iniciado el partido, no se podrán editar los pronósticos.
          </p>
        </section>

        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-primary" /> Puntaje
          </h3>
          <ul className="space-y-1 text-muted-foreground">
            <li>• <strong>Resultado exacto</strong> (goles de ambos equipos): <Badge variant="secondary">3 pts</Badge></li>
            <li>• <strong>Acierto del ganador o empate</strong>, sin resultado exacto: <Badge variant="secondary">1 pt</Badge></li>
            <li>• <strong>Pronóstico incorrecto</strong>: <Badge variant="outline">0 pts</Badge></li>
          </ul>
          <div className="mt-3">
            <p className="font-medium mb-1">Multiplicadores:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• <Badge>x1,5</Badge> en partidos de Argentina</li>
              <li>• <Badge>x2</Badge> en la final del Mundial</li>
            </ul>
          </div>
        </section>

        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <Trophy className="h-4 w-4 text-primary" /> Eliminación directa
          </h3>
          <ul className="space-y-1 text-muted-foreground">
            <li>• Se toma el resultado de los <strong>90 minutos reglamentarios</strong>.</li>
            <li>• Los <strong>penales no se consideran</strong> para la suma de puntos.</li>
            <li>• El ranking se actualiza de forma automática en la página del torneo.</li>
          </ul>
        </section>

        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <Gift className="h-4 w-4 text-primary" /> Premios
          </h3>
          <p className="text-muted-foreground">
            <strong>Viaje a Dubai todo pago</strong> o <strong>Camiseta de la Selección Argentina</strong>.
            <br />
            <span className="text-xs italic">El premio a entregar será elegido por Luis Paz.</span>
          </p>
        </section>

        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <Scale className="h-4 w-4 text-primary" /> Desempate
          </h3>
          <p className="text-muted-foreground mb-1">En caso de empate en puntos, se define por:</p>
          <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
            <li>Mayor cantidad de <strong>resultados exactos</strong> acertados.</li>
            <li>Mayor cantidad de <strong>aciertos de ganador/empate</strong>.</li>
            <li>Si persiste el empate, <strong>sorteo final</strong> entre los empatados.</li>
          </ol>
        </section>

        <p className="text-xs text-muted-foreground italic border-t pt-3">
          La participación en el Prode implica la aceptación total de estas reglas.
        </p>
      </CardContent>
    </Card>
  );
}
