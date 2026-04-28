
## Cambios a implementar

### 1. Aviso cuando se confirmó el email
**Auth.tsx + Pending.tsx**
- Detectar el callback de Supabase tras confirmar el email (la URL viene con `?type=signup` o un access_token en el hash) y mostrar un toast verde: "✅ Email confirmado. Tu cuenta está esperando aprobación del admin."
- En `Pending.tsx`, agregar un banner indicando que el email ya está verificado y solo falta la aprobación del admin.
- En `Admin > Usuarios pendientes`, mostrar un badge `Email verificado` (leyendo `email_confirmed_at` vía una función edge `list-pending-users` con service role, ya que `auth.users` no es accesible desde el cliente).

### 2. Puntaje parcial en vivo en la card del Live
**src/pages/Live.tsx**
- Cargar la predicción del usuario actual para el partido en vivo (`predictions` filtrado por `user_id` y `match_id`).
- Calcular en cliente los puntos parciales con el marcador actual (3 si exacto, 1 si acierta resultado, 0 si no) usando la misma lógica que `calc_points`.
- Mostrar dentro de la card: "Tu pronóstico: 2-1 · **Parcial: +3 pts**" con un badge verde/gris/outline según corresponda.
- Si el usuario no pronosticó: mostrar "No pronosticaste este partido".

### 3. Panel admin: logs de sync
**Nueva tabla `sync_logs`** (migración):
- `id uuid pk`, `function_name text`, `started_at timestamptz`, `finished_at timestamptz`, `status text` ('success'|'error'|'partial'), `updated_count int`, `error_message text`, `details jsonb` (con el array de results por partido).
- RLS: solo admin puede SELECT; INSERT vía service role (edge functions).

**Edge functions `sync-matches` y `sync-live-matches`**:
- Al iniciar, insertar un row con `status='running'`. Al terminar, actualizar con resultado, contadores y `details`.

**Admin.tsx**: nueva pestaña **"Sync"** que muestra los últimos 20 runs (función, hora, duración, estado, partidos actualizados, errores expandibles en accordion).

### 4. Forzar recálculo de puntos de un partido
**Migración**: nueva función `recalc_match_points(_match_id uuid)` SECURITY DEFINER que ejecuta el mismo `update predictions ... set points = calc_points(...)` para ese partido (solo invocable por admin vía RLS check interno con `has_role`).

**Admin.tsx > MatchAdminRow**: nuevo botón "Recalcular puntos" que llama a `supabase.rpc('recalc_match_points', { _match_id: m.id })` y muestra cuántas predicciones se actualizaron.

### 5. Bloquear/desbloquear pronósticos manualmente
**Migración**: agregar columna `predictions_locked boolean default false` a `matches`.

**Actualizar policies de `predictions`**:
- `predictions_insert_own_unlocked` y `predictions_update_own_unlocked`: agregar condición `and m.predictions_locked = false`.

**Admin.tsx > MatchAdminRow**: toggle/switch "🔒 Bloqueado" que actualiza ese campo. Mostrar el estado claramente.

**Predictions.tsx**: si `predictions_locked` está en true, deshabilitar inputs y mostrar leyenda "Pronósticos bloqueados por el admin".

### 6. Export del ranking final a CSV/PDF
**Admin.tsx**: nueva sección dentro de la pestaña "Sync" (o nueva "Export") con dos botones:
- **Exportar CSV**: arma en cliente un CSV con `posición, nombre, puntos, exactos, resultados, partidos jugados` y lo descarga con un `Blob`.
- **Exportar PDF**: usa `jspdf` + `jspdf-autotable` (agregar dependencias) para generar un PDF con título "Ranking Final – Mundial 2026", logo de ProHygiene y tabla con las mismas columnas.
- Ambos toman los datos agregados del mismo modo que `Ranking.tsx` (predicciones + matches finalizados).

## Detalles técnicos

```text
DB
├── sync_logs (nueva tabla)
├── matches.predictions_locked (nueva columna)
└── recalc_match_points(_match_id) (nueva función RPC)

Edge Functions
├── sync-matches: + log start/end en sync_logs
├── sync-live-matches: + log start/end en sync_logs
└── list-pending-users (nueva): devuelve perfiles pending + email_confirmed_at

Frontend
├── Auth.tsx: detectar confirmación de email → toast
├── Pending.tsx: banner "email verificado, esperando aprobación"
├── Live.tsx: card con "Tu pronóstico vs marcador en vivo · +X pts"
├── Predictions.tsx: respetar predictions_locked
└── Admin.tsx
    ├── tab Partidos: switch lock + botón recalcular por fila
    ├── tab Usuarios: badge "email verificado"
    └── tab Sync: tabla de logs + export CSV/PDF
```

Dependencias nuevas: `jspdf`, `jspdf-autotable`.
