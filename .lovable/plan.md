## Respuesta a tu pregunta sobre tiempo extra

La API de Football-Data devuelve dos marcadores: `fullTime` (90' reglamentarios) y `extraTime` (suplementario). Nuestra sincronización (`sync-live-matches`) usa **solo `fullTime`**, así que un partido que termina 1-1 en los 90' y 2-1 en alargue se guarda y se muestra como **1-1**. Los puntos se calculan sobre ese 1-1, que es lo que dicen las reglas.

Sobre la edición manual: la sync **solo toca partidos con estado `scheduled` o `live`**. En cuanto un partido pasa a `finished`, ya no se vuelve a sobrescribir desde la API. Entonces sí, podés cambiar manualmente el resultado desde el panel admin y queda fijo para siempre (a menos que vos mismo lo vuelvas a `live`/`scheduled`). Voy a dejar también un cartelito en la fila de admin aclarándolo.

---

## 1) Mejorar la UI de pronósticos (`src/pages/Predictions.tsx`)

Rediseñar `MatchCard` para que los equipos se vean grandes y claros, y mostrar mejor la info del partido:

- Banderas más grandes (h-12), nombre del equipo en 2 líneas si hace falta sin truncar, layout vertical en mobile cuando el ancho es chico (estamos en 384px).
- Header del card más informativo: fase + grupo + venue + horario AR + cuenta regresiva al cierre del pronóstico ("cierra en 2h 15m").
- Badge de multiplicador con tooltip clickeable (no solo `title=`) explicando "x2 Argentina + x1.5 Semifinal".
- Inputs de marcador más grandes y con +/- al costado para mobile (más fácil que tipear).
- Estado del partido más claro: verde "Abierto", amarillo "Cierra pronto", rojo "Cerrado", gris "Programado para más adelante".
- Resultado final, cuando ya jugó, con badge "Pleno" / "Resultado" / "Sin acierto" además de los puntos.

## 2) Puntos con decimal en todo el front

Ya tenemos `formatPoints()` y la DB ya guarda `numeric(6,2)`. Faltan reemplazos en `src/pages/Admin.tsx`:

- `PredictionsAdmin` (líneas ~798-802, 873-876, 928-934): el total `totalPts`, los contadores de "exactos"/"aciertos" y la celda `r.points` usan comparaciones a 1 y 3 enteros. Cambiar a:
  - `exactos` = donde `pred_a == score_a && pred_b == score_b`.
  - `aciertos` = donde acierta ganador/empate sin ser pleno.
  - Mostrar `formatPoints(totalPts)` y `formatPoints(r.points)`.
  - Color del punto: si pleno → success; si acierto → warning; si 0 → muted.
- Verificar `Profile.tsx`, `Ranking.tsx`, `Dashboard.tsx`, `MatchDetailsDialog.tsx`, `Predictions.tsx` (ya usan `formatPoints` por trabajo previo) y completar lo que haya quedado con `+N pts` sin formatear.

## 3) Mejorar ejemplos del reglamento (`src/components/TournamentRules.tsx`)

Reescribir el bloque de ejemplos para reflejar los multiplicadores reales (no hay multiplicador en dieciseisavos/octavos salvo Argentina, ni en Champions):

```
• Pleno en fase de grupos: 3 pts
• Acierto de ganador en fase de grupos: 1 pt
• Pleno de Argentina en fase de grupos: 3 × 2 = 6 pts
• Pleno en cuartos de final: 3 × 1,2 = 3,6 pts
• Pleno en cuartos de Argentina: 3 × 2 × 1,2 = 7,2 pts
• Pleno en semifinal: 3 × 1,5 = 4,5 pts
• Pleno en semifinal con Argentina: 3 × 2 × 1,5 = 9 pts
• Pleno en la final: 3 × 2 = 6 pts
• Pleno en la final con Argentina: 3 × 2 × 2 = 12 pts
```

También aclarar arriba: "Los partidos de Champions League no tienen multiplicador de fase, sólo el x2 si juega Argentina".

## 4) Rehacer el Modo Prueba (`src/pages/Admin.tsx` → `TestModeAdmin` + `BulkSimulator`)

Reorganizar para que sea fácil verificar TODO el flujo de punta a punta. Estructura nueva del tab:

**Card 1 — Estado actual del sistema**
- Tarjetas grandes: usuarios reales, usuarios test, partidos (programados/en vivo/finalizados), pronósticos cargados, **fecha del próximo cierre de ventana**, **partidos abiertos para pronosticar ahora**. Auto-refresh cada 5s.

**Card 2 — Acciones de simulación** (mantener pero mejoradas)
- Avanzar 5 partidos (resultado aleatorio, marca `test_mode=true`).
- Poner 3 partidos en vivo + Goleada en vivo.
- **Nuevo:** "Simular 1 partido específico" — selector de partido + inputs de marcador + botón para finalizarlo y disparar recálculo.
- **Nuevo:** "Recalcular TODO" — corre `recalc_match_points` sobre todos los `finished` y refresca leaderboard.
- Reset total prueba.

**Card 3 — Verificación end-to-end** (checklist interactivo)
Cada item con un botón "Verificar" que abre la página correspondiente y un check ✅/❌ basado en una query rápida:
- Ranking calculado (top 1 tiene > 0 pts).
- Top 5 del Dashboard coincide con `/ranking`.
- Multiplicadores aplicándose (busca un partido finalizado con multiplicador y muestra los puntos calculados con el ejemplo: "Pleno en cuartos = 3,6 pts ✅").
- Pronósticos cerrados respetan el lock (intenta un upsert con un usuario test sobre un partido locked; debería fallar).
- Bloqueo manual `force_closed` funciona.
- Realtime de marcadores OK (los inputs en `/pronosticos` se actualizan al cambiar un partido en vivo).

**Card 4 — Credenciales y links rápidos** (lo que ya hay).

## 5) Pequeño cartel informativo en `MatchAdminRow`

Agregar bajo el selector de marcador, cuando `status === 'finished'`:
*"El resultado guardado refleja los 90' reglamentarios. Una vez finalizado, la sincronización automática no lo sobrescribe; podés editarlo manualmente y queda fijo."*

## Archivos a modificar

- `src/pages/Predictions.tsx` — rediseño del `MatchCard`.
- `src/components/TournamentRules.tsx` — nuevos ejemplos.
- `src/pages/Admin.tsx` — `PredictionsAdmin` (puntos decimales y colores), `MatchAdminRow` (cartel), `TestModeAdmin` + `BulkSimulator` (rediseño completo con verificación interactiva).
- Repaso de `Ranking.tsx` / `Profile.tsx` / `Dashboard.tsx` / `MatchDetailsDialog.tsx` por si quedaron lugares con puntos enteros sin `formatPoints`.

Sin cambios de DB ni de edge functions.
