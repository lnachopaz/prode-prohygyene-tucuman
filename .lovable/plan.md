# Plan: Nuevo sistema de puntos con multiplicadores

## Reglas finales acordadas

| Condición | Multiplicador |
|---|---|
| Partido de Argentina | **x2** |
| Final del Mundial | **x3** |
| Octavos / Cuartos / Semis (eliminatorias previas a la final) | **x1.2** |
| Final de Argentina (caso combinado) | **x6** (2 × 3, se acumulan) |
| Argentina en Semis (ej.) | **x2.4** (2 × 1.2) |

Base sigue igual: 3 pts pleno, 1 pt resultado, 0 pts si falla.

Sin penalización por no pronosticar.

## Cambios

### 1. Función `calc_points` en la base de datos
Reescribirla para que reciba el partido completo y aplique los multiplicadores. Nueva firma sugerida:

```sql
calc_points_v2(pa, pb, sa, sb, team_a, team_b, stage)
  base = 3 si pleno, 1 si resultado, 0 si falla
  mult = 1
  si team_a o team_b contiene 'Argentina' → mult *= 2
  si stage es la final del Mundial → mult *= 3
  sino si stage es octavos/cuartos/semis → mult *= 1.2
  return floor(base * mult)
```

Detalle:
- Detección de Argentina: `team_a ILIKE '%argentina%' OR team_b ILIKE '%argentina%'`.
- Detección de fase por `matches.stage` (texto). Mapeo robusto:
  - **Final**: contiene `'final'` y NO contiene `'semi'` ni `'tercer'/'third'/'1/2'`.
  - **Eliminatorias x1.2**: contiene `'octavo'/'round of 16'/'last 16'` o `'cuarto'/'quarter'` o `'semi'`.
  - **Tercer puesto**: lo tratamos como x1.2 también (es eliminatoria). Puede revisarse.
  - Resto (grupos): x1.
- Como los multiplicadores no enteros (1.2, 2.4, etc.) generan decimales, se usa `ROUND(base * mult)` para mantener `points` como `int`. Ejemplos:
  - Pleno en cuartos: 3 × 1.2 = 3.6 → **4 pts**
  - Resultado en cuartos: 1 × 1.2 = 1.2 → **1 pt**
  - Pleno Argentina en semis: 3 × 2 × 1.2 = 7.2 → **7 pts**
  - Pleno Argentina en final: 3 × 2 × 3 = **18 pts**

### 2. Mantener compatibilidad
- La función vieja `calc_points(pa,pb,sa,sb)` se mantiene (algunas migraciones la referencian) pero internamente llama a la nueva con valores neutros, **o** la actualizamos para que siga existiendo y creamos `calc_points_match(pred_a, pred_b, match_id)` como wrapper.
- Actualizar:
  - `recalc_predictions_for_match` (trigger en matches) → usar la nueva fórmula con datos de `NEW`.
  - `recalc_match_points(_match_id)` (función admin) → idem, lee el match y aplica.

### 3. Recalcular puntos históricos
Una sola vez en la migración: `UPDATE predictions ... SET points = nuevo_cálculo` para todos los partidos ya finalizados, así el ranking refleja las nuevas reglas desde el inicio.

### 4. UI: actualizar `TournamentRules.tsx`
Reescribir la sección Puntaje:

> **Multiplicadores** (se acumulan si coinciden):
> - **x2** en partidos de Argentina
> - **x3** en la Final del Mundial
> - **x1.2** en Octavos, Cuartos y Semifinales
>
> Ejemplos:
> - Pleno en un partido normal: 3 pts
> - Pleno en cuartos de Argentina: 3 × 2 × 1.2 = **7 pts**
> - Pleno en la Final con Argentina: 3 × 2 × 3 = **18 pts**

### 5. UI: mostrar el multiplicador en cada partido
En `Predictions.tsx` y en la tarjeta del próximo partido (Dashboard), agregar un badge cuando aplica:
- 🇦🇷 **x2** si juega Argentina
- 🏆 **x3** si es la final
- ⚡ **x1.2** si es octavos/cuartos/semis
- Combinado: **x6** si es final de Argentina, **x2.4** si Argentina en semis, etc.

Esto hace el sistema transparente y agrega tensión a los partidos importantes.

## Detalles técnicos

- Los puntos en `predictions.points` quedan en INTEGER (con redondeo `ROUND`).
- La detección de fase por texto es lo más portable; alternativa más robusta sería agregar columnas `is_final BOOLEAN` y `is_knockout BOOLEAN` a `matches`, pero implica seedear cada partido. **Propongo empezar por detección por texto** y, si vemos errores, migrar a columnas.
- Performance: `calc_points` sigue siendo `IMMUTABLE`/`STABLE` y trivial.

## Pregunta abierta menor
- **Tercer puesto** (3°/4°): ¿lo tratamos como x1.2 (eliminatoria) o como partido normal x1? Sugiero **x1.2** por consistencia, pero si querés que solo cuente como un partido más, lo dejo en x1.

## Archivos a tocar
- `supabase/migrations/<nuevo>.sql` — nueva función + recálculo histórico.
- `src/components/TournamentRules.tsx` — texto de reglas.
- `src/pages/Predictions.tsx` — badge de multiplicador junto a cada partido.
- `src/pages/Dashboard.tsx` — badge en la tarjeta de "próximo partido" (opcional).
