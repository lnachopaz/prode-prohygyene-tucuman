# Arreglar partidos duplicados en la tabla

## Diagnóstico

Revisé la base de datos y encontré el problema real:

- Hay **104 partidos correctos** del Mundial 2026 cargados en español (con nombres como "México", "Sudáfrica", "Estadio Ciudad de México") — este es el fixture oficial completo (48 equipos, 104 partidos).
- Hay **15 partidos duplicados en inglés** (con nombres como "Mexico", "South Africa", stage = "Group Stage") que entraron desde **TheSportsDB** vía la edge function `sync-matches`.

Por ejemplo, México vs Sudáfrica aparece dos veces:
- "México vs Sudáfrica" — 11 jun 15:00 UTC — Estadio Ciudad de México (correcto)
- "Mexico vs South Africa" — 11 jun 19:00 UTC — Group Stage (duplicado de TheSportsDB con horario incorrecto)

Como tienen `external_id` distintos y nombres traducidos, el `upsert` no los detectó como iguales.

**Buena noticia:** los 15 duplicados NO tienen pronósticos asociados (verificado), así que se pueden borrar sin perder datos de usuarios.

## Plan de acción

### 1. Borrar los 15 partidos duplicados
Eliminar todos los partidos donde `stage = 'Group Stage'` (los 15 que vinieron de TheSportsDB; el fixture en español usa stages como "Fase de grupos · Estadio X").

### 2. Desactivar la edge function de sincronización
Para que los duplicados no vuelvan a entrar la próxima vez que alguien presione "Sincronizar" desde el Admin:
- Modificar `supabase/functions/sync-matches/index.ts` para que devuelva un mensaje indicando que el fixture ya está cargado manualmente y no haga el upsert.
- Alternativa: ocultar/quitar el botón "Sincronizar fixture" del panel de Admin (`src/pages/Admin.tsx`).

### 3. NO recargar partidos desde internet
El fixture completo y correcto del Mundial 2026 (las 104 fechas oficiales en español, con sedes correctas) **ya está cargado**. No es necesario buscar partidos en internet — solo hay que limpiar los duplicados que metió la sincronización vieja.

## Detalles técnicos

- **Migración SQL:** `DELETE FROM matches WHERE stage = 'Group Stage';` (borra exactamente 15 filas, ninguna con predictions).
- **Edge function:** dejar `sync-matches/index.ts` como no-op que retorna `{ disabled: true, message: "Fixture cargado manualmente" }` para no romper el botón existente del admin.
- **Admin UI:** opcionalmente reemplazar el botón "Sincronizar" por un texto informativo.

¿Procedo con esto?
