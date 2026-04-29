# Plan: Mejorar pestaña Ranking (más info + fix mobile)

## Problemas actuales
1. **Mobile**: las 7 columnas (`#`, ↑↓, jugador, 🔥, plenos, resultados, total) suman ~280px fijos + gaps; en pantallas <400px se aprieta y los puntos quedan recortados o pegados al borde.
2. **Poca info contextual**: no se ve el promedio de puntos por partido, cuántos pronósticos cargó cada uno, ni gap respecto al líder/usuario propio.

## Cambios

### 1. Header con tarjeta personal "Mi posición" (nuevo)
Arriba del filtro de fases, una card compacta con:
- Mi puesto (#X de Y) + delta vs jornada anterior.
- Mis puntos totales · plenos · aciertos resultado · racha.
- **Diferencia con el líder** (ej: "−12 pts del 1°") y **diferencia con el siguiente** (ej: "+3 pts sobre #4").
- Promedio de puntos por partido finalizado.

### 2. Estadísticas globales del torneo (nuevo, card pequeña)
Strip de stats arriba:
- Partidos jugados / total.
- Total de pronósticos cargados.
- Promedio de aciertos del grupo.
- Líder actual (nombre + pts).

### 3. Tabla rediseñada con layout responsive
Reemplazar el `grid-cols-[...]` fijo por un layout que funcione en mobile:

**Mobile (<640px)** — fila apilada en 2 niveles:
```
[#] [avatar] Nombre (vos)        [TOTAL pts]
              🔥3 · ✓5 plenos · 8 res · ↑2
```
- Total de puntos a la derecha grande y legible.
- Stats secundarias en línea inferior con iconos pequeños.

**Desktop (≥640px)** — tabla con columnas (más datos):
```
# | Δ | Jugador | Pronós | Plenos | Resultados | Racha | Prom | Total
```
- Agregar columnas: **Pronós** (cuántos cargó) y **Prom** (puntos / partidos finalizados).

### 4. Mejor presentación visual
- Top 3 con medalla 🥇🥈🥉 (icono Trophy/Medal) en vez de solo color de número.
- Avatar (si existe `avatar_url`) en círculo pequeño junto al nombre.
- Badge "Líder" para el #1.
- Resaltado más visible para "vos" (border-l accent + bg).

### 5. Pequeñas mejoras de UX
- Sticky header de la tabla al scrollear.
- Texto "actualizado hace X" abajo.
- Mantener filtros de fase tal cual.

## Detalles técnicos
- Todo CSS-only con Tailwind (`hidden sm:grid` / `grid sm:hidden`) — sin librerías nuevas.
- Reusar tokens semánticos existentes (`text-primary`, `text-success`, `text-warning`, `bg-muted`).
- Calcular nuevos derivados en el `useMemo` existente (`avg`, gaps al líder/siguiente) — sin queries nuevas.
- No tocar lógica de fetch ni de agregación por fase.

## Archivos a editar
- `src/pages/Ranking.tsx` (único archivo).

## Pregunta abierta
¿Mantengo la card "Mejor por fase" arriba como está, o la muevo abajo de la tabla para priorizar primero "Mi posición" y "Stats globales" en el viewport inicial mobile?
