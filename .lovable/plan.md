## Diagnóstico — qué está pasando

Encontré 4 problemas y todos tienen una causa común muy simple. Te los explico antes del plan:

### 1) El Ranking muestra datos incorrectos (Test User 001 con 5 pts en vez de Test User 092 con 28 pts)

**Causa:** Supabase devuelve **máximo 1000 filas por query** por defecto. La página de Ranking pide `predictions` con un solo SELECT (`supabase.from("predictions").select(...)`) y como hoy hay **~10.400 predicciones** (100 usuarios × 104 partidos), solo recibe las primeras 1000 — un subconjunto incompleto y sesgado por el orden interno. Por eso aparece "Test User 001" arriba: es de los primeros que entraron en esas 1000 filas.

La consulta directa a la base confirma el ranking real:

```
1. Test User 092 → 28 pts (7 plenos, 7 resultados)
2. Test User 045 → 28 pts (6 plenos, 10 resultados)
3. Test User 039 → 26 pts
4. Test User 051 → 25 pts
5. Test User 090 → 25 pts
```

Esos números **sí** aparecen bien en "Resumen" porque el Dashboard usa la vista `leaderboard` agregada en el servidor (no choca con el límite).

### 2) "Resumen" no refleja lo mismo que "Ranking"

Mismo origen: cada pantalla calcula los puntos de forma distinta.
- **Dashboard** → vista `leaderboard` (server-side, correcta).
- **Ranking** → agrega en el cliente con la query truncada (incorrecta).
- **Perfil** → trae solo tus predicciones (correcto, no le afecta el límite).
- **Export CSV/PDF del admin** → mismo bug que Ranking, también truncado a 1000 filas.

### 3) Admin no puede ver los pronósticos del resto

A nivel base de datos sí puede (la policy `predictions_admin_all` se lo permite), pero **no existe ninguna pantalla** que los muestre. Hay que construirla.

### 4) El "modo prueba" no te sirvió

El tab actual de Modo Prueba solo deja simular **un partido en vivo a la vez**. Lo que vos necesitás para validar con 100 usuarios es algo más integral: avanzar varios partidos de una, generar partidos en vivo con goles, ver el ranking moverse, etc.

---

## Plan de cambios

### A. Arreglar el Ranking (causa raíz)

Reescribir `src/pages/Ranking.tsx` para usar la vista `leaderboard` (igual que el Dashboard) en el modo "Todas":
- Modo "Todas" → leer directo de `leaderboard` (1 fila por usuario, sin límite).
- Filtros por fase (Grupos / Octavos / etc.) → calcular en el cliente, pero **paginando** las predicciones en bloques de 1000 con `.range()` hasta traerlas todas, así el resultado es completo.
- Mantener el cálculo de "Mejor por fase", "racha 🔥" y los indicadores ↑/↓ con la misma lógica paginada.

### B. Alinear "Resumen" con el Ranking

- Que el Top 5 del Dashboard y el Ranking compartan exactamente la misma fuente (`leaderboard`).
- Mostrar en el Resumen los mismos puntos que el usuario verá en su fila del Ranking (ya viene de `leaderboard`, pero lo verificamos visualmente).
- Mostrar la **posición del usuario** ("Estás 8º de 101") en el Dashboard, leyéndola del leaderboard ordenado.

### C. Admin: ver pronósticos de cualquier participante

Agregar un nuevo tab **"Pronósticos"** en `/admin`:
- Selector de usuario (lista todos los aprobados, con buscador por nombre/email).
- Tabla con todos sus pronósticos: partido, fecha, fase, su pronóstico, resultado real, puntos obtenidos.
- Filtros por estado (Programado / En vivo / Finalizado) y por fase.
- Resumen arriba: total de puntos, plenos, aciertos, % efectividad.
- Botón "Exportar CSV" de los pronósticos de ese usuario.
- Aprovechar la policy `predictions_admin_all` que ya existe.

Y arreglar el **export del ranking** del admin para que también use `leaderboard` (o pagine), así no queda truncado.

### D. Modo prueba real con los 100 usuarios

Reemplazar el tab actual "🧪 Modo prueba" por un **panel de simulación masiva** pensado para validar el flujo completo:

1. **Estado actual del entorno de prueba** (header):
   - Usuarios test: 100 · Usuarios reales: 1
   - Partidos: 30 finalizados / 1 en vivo / 73 programados
   - Predicciones cargadas: ~10.400

2. **Acciones rápidas** (botones grandes):
   - **"Avanzar 5 partidos"** → marca como `finished` los próximos 5 programados con resultados aleatorios y dispara el recálculo de puntos (vas a ver el ranking moverse en vivo).
   - **"Poner 3 partidos en vivo"** → 3 partidos `live` con marcador 0-0, marcados como `test_mode=true`.
   - **"Goleada en vivo"** → suma goles aleatorios cada 3 segundos a los partidos en vivo durante 30 seg (para ver la pestaña Live moviéndose y los puntos parciales).
   - **"Reset total prueba"** → vuelve todos los partidos `test_mode=true` a `scheduled` sin tocar los reales.

3. **Cómo se verifica**: una checklist en pantalla con links directos:
   - ✅ Ir a `/ranking` → ver posiciones cambiando.
   - ✅ Ir a `/live` → ver marcadores y puntos parciales.
   - ✅ Ir a `/` (Resumen) → confirmar que el Top 5 coincide con el Ranking.
   - ✅ Ir a `/admin` → tab Pronósticos → elegir Test User 092 y ver sus 30 pronósticos puntuados.

4. **Credenciales para probar como participante**: mostrar en pantalla `test001@prode.test … test100@prode.test` / contraseña `Prode2026!` para que puedas loguearte como cualquiera y ver la app desde su perspectiva.

---

## Cómo debería verse cuando esté listo

**Ranking (`/ranking`, tab "Todas"):**
```
#  Jugador          🔥  Plen.  Res.  Total
1  Test User 092         7     7     28
2  Test User 045         6    10     28
3  Test User 039         5    11     26
4  Test User 051         6     7     25
5  Test User 090         4    13     25
…
8  Ignacio Paz (vos)     0     1      1
```

**Resumen (`/`):** el Top 5 de la derecha coincide exacto con las 5 primeras filas del Ranking. Tu tarjeta "Mis puntos" coincide con tu fila del ranking.

**Admin → Pronósticos:** elegís "Test User 092" y ves sus 104 pronósticos con resultado y puntos al lado.

**Admin → Modo prueba:** una sola pantalla donde apretás "Avanzar 5 partidos" y al instante vas a `/ranking` y ves el orden cambiar.

---

## Lo que vas a tener que revisar vos

Cuando termine los cambios, te paso esta checklist para validar:

1. **Ranking correcto:** abrir `/ranking` y confirmar que arriba aparece **Test User 092 con 28 pts** (no Test User 001).
2. **Coherencia Resumen ↔ Ranking:** el Top 5 del Dashboard debe ser idéntico al Top 5 del Ranking, mismos nombres y mismos puntos.
3. **Tu posición:** en el Dashboard debe decir tu puesto real (probablemente entre 60-90 de 101, según tus pronósticos).
4. **Admin / Pronósticos:** elegí 2-3 usuarios distintos y verificá que ves sus pronósticos con puntos ya calculados.
5. **Modo prueba:** apretá "Avanzar 5 partidos", esperá 2 segundos, andá al ranking y mirá cómo cambia el orden. Después "Reset total prueba" para dejarlo limpio.
6. **Live:** apretá "Poner 3 partidos en vivo" + "Goleada en vivo", andá a `/live` y mirá los marcadores y los puntos parciales actualizándose.

---

## Detalle técnico (para referencia)

- **Causa del bug Ranking:** Supabase PostgREST aplica `LIMIT 1000` por defecto. Solución: usar la vista `leaderboard` ya existente para "Todas", o paginar con `.range(from, to)` en bucle para los filtros por fase.
- **Archivos a tocar:**
  - `src/pages/Ranking.tsx` — refactor a leaderboard + paginación.
  - `src/pages/Dashboard.tsx` — agregar "Tu posición" desde leaderboard ordenado.
  - `src/pages/Admin.tsx` — nuevo tab `Pronósticos`, refactor del tab `Modo prueba`, fix del export con paginación.
- **Sin cambios de base de datos:** la vista `leaderboard` y la policy `predictions_admin_all` ya existen, no hace falta migración.
- **Rendimiento:** con 100 usuarios y 104 partidos las queries paginadas son ~11 round-trips de 1000 filas (≈ 1-2 seg) — aceptable para una pantalla admin. Para el Ranking público quedará instantáneo porque usa el agregado server-side.
