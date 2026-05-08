import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Calendar, Trophy, Target, Gift, Scale } from "lucide-react";

export function TournamentRules() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" /> Reglamento Prode Mundial 2026
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-primary" /> Carga de pronósticos
          </h3>
          <p className="text-muted-foreground mb-2">
            Los pronósticos se pueden cargar dentro de las ventanas habilitadas para cada fase.
            Las fases se desbloquean progresivamente:
          </p>
          <ul className="space-y-1 text-muted-foreground">
            <li>• <strong>Fecha 1</strong> (fase de grupos): hasta el 10/06 a las 23:00 hs</li>
            <li>• <strong>Fecha 2</strong> (fase de grupos): a partir del 11/06 a las 16:00 hs hasta el 17/06 a las 23:00 hs</li>
            <li>• <strong>Fecha 3</strong> (fase de grupos): a partir del 18/06 a las 16:00 hs hasta el 23/06 a las 23:00 hs</li>
            <li>• <strong>Dieciseisavos de final</strong>: a partir del 24/06 a las 16:00 hs hasta el 27/06 a las 23:00 hs</li>
            <li>• <strong>Octavos de final</strong>: a partir del 28/06 a las 16:00 hs hasta el 03/07 a las 23:00 hs</li>
            <li>• <strong>Cuartos de final</strong>: a partir del 04/07 a las 16:00 hs hasta el 08/07 a las 23:00 hs</li>
            <li>• <strong>Semifinales</strong>: a partir del 09/07 a las 16:00 hs hasta el 13/07 a las 23:00 hs</li>
            <li>• <strong>Final y 3°/4° puesto</strong>: a partir del 14/07 a las 16:00 hs hasta el 17/07 a las 23:00 hs</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2 italic">
            Una vez vencido el plazo, no se podrán editar los pronósticos.
          </p>
        </section>

        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-primary" /> Puntaje
          </h3>
          <ul className="space-y-1 text-muted-foreground">
            <li>• <strong>Pleno</strong> (goles de ambos equipos): <Badge variant="secondary">3,0 pts</Badge></li>
            <li>• <strong>Acierto del ganador o empate</strong>, sin pleno: <Badge variant="secondary">1,0 pt</Badge></li>
            <li>• <strong>Pronóstico incorrecto</strong>: <Badge variant="outline">0,0 pts</Badge></li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2 italic">
            Los puntos se redondean a 1 decimal para reflejar los multiplicadores.
          </p>
          <div className="mt-3">
            <p className="font-medium mb-1">Multiplicadores (se acumulan si coinciden):</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• <Badge>x2</Badge> en partidos de Argentina</li>
              <li>• <Badge>x2</Badge> en la final del Mundial</li>
              <li>• <Badge>x1,5</Badge> en semifinales y 3° puesto</li>
              <li>• <Badge>x1,2</Badge> en octavos y cuartos de final</li>
              <li>• Dieciseisavos de final: sin multiplicador (x1)</li>
            </ul>
            <div className="mt-2 rounded-md border bg-muted/40 p-2 text-xs space-y-1">
              <p className="font-medium text-foreground">Ejemplos:</p>
              <p>• Pleno en un partido normal: <strong>3,0 pts</strong></p>
              <p>• Acierto de resultado en octavos: 1 × 1,2 = <strong>1,2 pts</strong></p>
              <p>• Pleno en octavos: 3 × 1,2 = <strong>3,6 pts</strong></p>
              <p>• Pleno en cuartos de Argentina: 3 × 2 × 1,2 = <strong>7,2 pts</strong></p>
              <p>• Acierto de resultado en semifinal de Argentina: 1 × 2 × 1,5 = <strong>3,0 pts</strong></p>
              <p>• Pleno en semifinal de Argentina: 3 × 2 × 1,5 = <strong>9,0 pts</strong></p>
              <p>• Pleno en la Final con Argentina: 3 × 2 × 2 = <strong>12,0 pts</strong></p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <Trophy className="h-4 w-4 text-primary" /> Eliminación directa
          </h3>
          <ul className="space-y-1 text-muted-foreground">
            <li>• Se toma el resultado de los <strong>90 minutos reglamentarios</strong>.</li>
            <li>• Los <strong>penales no se consideran</strong> para la suma de puntos.</li>
            <li>• El ranking se actualiza de forma automática en la página del torneo una vez finalizado el partido.</li>
          </ul>
        </section>

        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <Gift className="h-4 w-4 text-primary" /> Premios <span className="text-sm font-normal text-muted-foreground">(Sostenible a 70 personas)</span>
          </h3>
          <ul className="space-y-1 text-muted-foreground">
            <li>• <strong>1°:</strong> $350.000</li>
            <li>• <strong>2°:</strong> $175.000</li>
            <li>• <strong>3°:</strong> $100.000</li>
          </ul>
        </section>

        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <Scale className="h-4 w-4 text-primary" /> Desempate
          </h3>
          <p className="text-muted-foreground mb-1">En caso de empate en puntos, se define por:</p>
          <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
            <li>Mayor cantidad de <strong>plenos</strong> acertados.</li>
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
