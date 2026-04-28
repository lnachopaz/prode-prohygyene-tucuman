## Objetivo

Que los pronósticos no estén disponibles desde el primer día. Los partidos se irán desbloqueando a medida que avance el torneo, evitando que alguien cargue ahora mismo todos los partidos hasta la final.

## Regla de desbloqueo

**Fase de grupos (por grupo, independiente cada uno):**
- Jornada 1 de cada grupo: **abierta desde el inicio**.
- Jornada 2 de un grupo: se desbloquea cuando **arranca el primer partido de la Jornada 1 de ese mismo grupo**.
- Jornada 3 de un grupo: se desbloquea cuando **arranca el primer partido de la Jornada 2 de ese mismo grupo**.

**Eliminatorias (mano a mano, todas juntas por ronda):**
- Dieciseisavos: bloqueado hasta que **arranque el primer partido de la Jornada 3 de fase de grupos**.
- Octavos: se desbloquea cuando **arranque el primer partido de Dieciseisavos**.
- Cuartos: se desbloquea cuando **arranque el primer partido de Octavos**.
- Semifinales: se desbloquea cuando **arranque el primer partido de Cuartos**.
- Tercer puesto y Final: se desbloquean cuando **arranque la primera Semifinal**.

Además del bloqueo por ronda, sigue vigente el cierre individual de cada partido **1 hora antes del kickoff** (ya existente).

## Visualización

Los partidos bloqueados por ronda **se siguen mostrando** en la lista, pero:
- Inputs deshabilitados.
- Badge tipo "Bloqueado · se abre cuando arranque [ronda anterior]".
- Countdown hasta el kickoff del primer partido de la ronda anterior (que es lo que dispara el desbloqueo).
- Botón "Guardar pronóstico" oculto (igual que con el cierre actual).
- En `MatchDetails`, mismo tratamiento: si la ronda está bloqueada, no se permite cargar.

## Detalles técnicos

**1. Helper de "rondas" y desbloqueo (frontend, sin cambios de schema)**

Crear `src/lib/unlock.ts` con:
- `getRoundKey(match)`: devuelve la "ronda" lógica del partido.
  - Fase de grupos: `"group:<group_name>:J<n>"` (ej: `"group:Grupo A:J2"`).
  - Knockout: `"ko:<stage>"` (ej: `"ko:Dieciseisavos de final"`, `"ko:Octavos de final"`, etc.).
- `getUnlockTrigger(match, allMatches)`: devuelve el `Date` (kickoff del primer partido de la ronda anterior) que desbloquea esta ronda. `null` si la ronda no tiene precondición (J1 de grupos).
- `isRoundUnlocked(match, allMatches, now)`: `true` si la ronda ya está desbloqueada.

Orden de rondas KO inferido del `stage` por palabras clave: `Dieciseisavos` → `Octavos` → `Cuartos` → `Semifinal` → `Tercer puesto`/`Final`. Tercer puesto y Final comparten trigger (primera semifinal). Si el fixture no contiene una ronda intermedia (ej: no hay Dieciseisavos), el helper salta a la ronda anterior existente.

**2. `src/pages/Predictions.tsx`**
- En `MatchCard`, calcular `roundUnlocked` con el helper.
- `locked = roundLocked || timeWindowLocked || match.status !== "scheduled"`.
- Si `roundLocked && !timeWindowLocked`, mostrar badge "Bloqueado" + texto "Se desbloquea cuando arranque [nombre de ronda anterior]" + reusar `<Countdown to={trigger} />`.
- Pasar `allMatches` al `MatchCard` (ya disponible via `matches` en el componente padre).
- Filtro "Estado" del select: agregar opción "Bloqueados por ronda" para listarlos por separado si querés (opcional, decidible en build).

**3. `src/pages/MatchDetails.tsx`**
- Misma lógica: cargar todos los matches (query liviana de `id, stage, group_name, kickoff_at, status`) para evaluar `isRoundUnlocked`.
- Si la ronda está bloqueada, mostrar mensaje en lugar del bloque "Pronósticos de los demás" y, si existiera UI de carga aquí, ocultarla.

**4. RLS / backend**
- **No se modifica.** Las políticas actuales ya impiden cargar pronósticos a menos de 1h del kickoff, y un usuario malicioso técnicamente podría intentar `INSERT` directo, pero la validación de "ronda anterior arrancada" se aplica en el cliente. Si querés enforcement server-side, decirlo y agrego una RLS extra que valide contra `matches` de la ronda anterior (más complejo, requiere función `is_round_unlocked(match_id)` en SQL).

## Archivos afectados

- **Crear**: `src/lib/unlock.ts`
- **Editar**: `src/pages/Predictions.tsx` (uso del helper en `MatchCard`, badge + countdown)
- **Editar**: `src/pages/MatchDetails.tsx` (bloqueo de la vista cuando la ronda no está abierta)

## Fuera de alcance

- No se cambia la regla de cierre 1h antes del kickoff.
- No se cambian rankings ni cálculo de puntos.
- No se enforza la regla en RLS (consultar si lo querés agregar).
