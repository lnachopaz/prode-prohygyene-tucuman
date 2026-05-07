## Plan

### 1. Restaurar Levante vs Osasuna a su horario real (Football-Data)

Actualmente el partido `external_id = 'fd-544554'` está con `kickoff_at` simulado y `status='live'` a partir de las pruebas anteriores. Hay que devolverlo a su horario oficial para que el ciclo natural lo dispare:

- `UPDATE matches SET kickoff_at = '2026-05-08T19:00:00Z', status='scheduled', score_a=NULL, score_b=NULL WHERE external_id='fd-544554';`

Con esto, el cron `sync-live-matches` (cada minuto) lo detectará automáticamente cuando entre en la ventana ±7 min del kickoff y lo marcará `live`; luego, ~115/120/125 min después leerá `score.regularTime` y lo finalizará con los puntos recalculados.

### 2. Mover el ícono del calendario dentro del recuadro del partido

En `src/pages/Predictions.tsx`:

- En el header del agrupador por fecha (`<h2>` línea 260-266): **quitar** el `<Calendar />` — solo queda el texto de la fecha.
- En el header del `MatchCard` (líneas 426-436): debajo de la línea "Fase · Grupo" agregar una nueva línea con `<Calendar className="h-3 w-3" />` + `formatAR(kickoff_at, "EEE dd/MM · HH:mm 'hs'")`. La línea de "EEE dd/MM · HH:mm hs" ya existente queda igual o se reemplaza, manteniendo solo una con el ícono.

Resultado:

```text
Fuera del recuadro:  jueves 11 de junio 2026
Dentro del recuadro: Fase de Grupos · Grupo A
                     📅 jue 11/06 · 16:00 hs · México DF
```

### 3. Permitir al admin borrar pronósticos de los usuarios

En `src/pages/Admin.tsx`, dentro de `EditablePredRow` (líneas 1024-1161):

- Agregar un botón "Borrar" (ícono `Trash2`) al lado del lápiz de edición.
- Al confirmar, ejecuta `supabase.rpc("admin_delete_prediction", { _prediction_id: row.id })` (la función ya existe en la base) y luego invalida `["pred-admin-rows"]` y `["ranking-leaderboard"]`.
- Confirmación con `AlertDialog`: "Borrar el pronóstico de {userName} para {team_a} vs {team_b}. El usuario aparecerá como si no hubiera cargado nada. Esta acción no se puede deshacer."

### 4. Reorganizar tabs: eliminar "Sync & Export" y mover los backups a "Códigos admin" → "Export & Código"

En `src/pages/Admin.tsx`:

- En la `TabsList` (línea 36-43): **eliminar** `<TabsTrigger value="sync">Sync & Export</TabsTrigger>` y renombrar `<TabsTrigger value="codes">Códigos admin</TabsTrigger>` → `Export & Código`.
- Eliminar `<TabsContent value="sync">…</TabsContent>` (línea 48).
- La función `SyncAdmin` se elimina (incluyendo el card "Sincronización (solo al finalizar)" y los logs). **Nota**: el botón manual "Sync partidos" en la pestaña Partidos ya cubre la sincronización manual; los logs dejan de mostrarse en UI (siguen quedando en la base por si hace falta debug futuro).
- Las funciones `BackupAllPredictions` y `ExportRanking` se mueven a `CodesAdmin`: se renderizan dentro del componente, debajo del bloque de "Nuevo código" + listado de códigos.
- Cambiar el título de la sección/header de la pestaña en `CodesAdmin` para que se vea claramente que ahora es "Export & Códigos de Admin" (separadores con `<h3>` o `<Card>` por bloque).

### Detalles técnicos

- Los puntos se recalculan automáticamente al borrar el pronóstico (no hay puntos al no existir el row). Para el partido finalizado: el ranking se actualiza al invalidar las queries.
- La RPC `admin_delete_prediction(_prediction_id uuid)` ya está creada con `has_role(auth.uid(),'admin')`.
- No se modifican RLS ni esquema. Solo cambios de UI + 1 update SQL para Levante.
- Edge function `sync-live-matches` no cambia: ya está en v2 con ventanas correctas.

### Archivos a modificar

- `src/pages/Predictions.tsx` (íconos calendario)
- `src/pages/Admin.tsx` (tabs, mover componentes, botón borrar)
- 1 update SQL vía `supabase--insert` para restaurar el partido del Levante.
