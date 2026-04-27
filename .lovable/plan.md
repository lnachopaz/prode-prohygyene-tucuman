# Cargar fixture oficial del Mundial 2026 desde FIFA.com

## Problema actual

La tabla `matches` tiene partidos duplicados (ej. México-Sudáfrica aparece 2 veces) porque la edge function `sync-matches` se alimenta de **TheSportsDB**, que devuelve datos incompletos/inconsistentes y sin `external_id` estable, además de mezclar nombres de equipos en distintos idiomas.

## Solución

Reemplazar la fuente de datos por el **fixture oficial de FIFA.com** que ya verifiqué (página `scores-fixtures` del Mundial 2026). Los datos son completos: 48 equipos, 12 grupos (A–L), 72 partidos de fase de grupos + eliminatorias, con sede, fecha y hora local del estadio.

## Pasos

### 1. Generar el dataset definitivo (script local, una sola vez)

- Parsear el markdown de la página de FIFA que ya tengo descargado (1753 líneas, contiene los 104 partidos del torneo).
- Extraer por cada partido: `team_a`, `team_b`, `group_name`, `stage` ("Primera fase", "Octavos", "Cuartos", "Semifinales", "Final"), estadio, fecha local y hora local.
- Mapear cada **estadio → zona horaria** para convertir la hora local correctamente a UTC en `kickoff_at`. Mapa de sedes:
  ```
  Ciudad de México, Guadalajara, Monterrey  → America/Mexico_City
  Toronto                                   → America/Toronto
  Vancouver                                 → America/Vancouver
  Atlanta, Boston, Filadelfia, NY/NJ, Miami → America/New_York
  Dallas, Houston, Kansas City, Monterrey   → America/Chicago (Dallas/Houston/KC) / Monterrey ya MX
  Seattle, Los Ángeles, Bahía de SF         → America/Los_Angeles
  ```
- Asignar `external_id = "fifa-<idMatch>"` (el ID que aparece en cada URL `/match/17/285023/289273/<idMatch>`) para evitar duplicados futuros.
- Generar un único archivo TS en el repo con todas las filas tipadas.

### 2. Limpiar y recargar la base de datos

- Migración SQL: `DELETE FROM matches;` (esto también elimina pronósticos huérfanos vía cascada lógica — confirmar si conservar pronósticos de usuarios ya cargados; ver "Cuestión abierta" abajo).
- Insertar las ~104 filas del fixture oficial usando la herramienta de inserción.
- Mantener el campo `team_a_flag`/`team_b_flag` en `null` — el frontend ya resuelve la bandera con `getCountryFlagUrl()` por nombre del país (lib `countryFlags.ts`). Asegurar que **todos** los nombres usados (ej. "RI de Irán", "Islas de Cabo Verde", "RD Congo", "República de Corea", "EE. UU.", "Bosnia y Herzegovina", "Curazao") estén en el diccionario.

### 3. Deshabilitar el sync automático con TheSportsDB

- Quitar el botón "Sincronizar fixture" del panel admin (o renombrarlo a "Recargar fixture oficial" apuntando a una nueva edge function que reinserte el dataset estático).
- Marcar la edge function `sync-matches` como obsoleta o reemplazar su contenido por un seed del dataset estático (más confiable que scraping en runtime, ya que FIFA no expone API pública).

### 4. Frontend

- No requiere cambios en `Predictions.tsx`.
- Ampliar `src/lib/countryFlags.ts` con cualquier nombre faltante detectado en el parseo.

## Detalles técnicos

- **Archivo nuevo**: `src/data/worldCup2026Fixture.ts` — array tipado con los partidos (single source of truth).
- **Edge function reescrita**: `supabase/functions/sync-matches/index.ts` → en vez de fetchear TheSportsDB, hace `upsert` del dataset estático con `onConflict: "external_id"`. Idempotente y rápido.
- **Migración**: limpieza de `matches` + inserción inicial (o dejar que el admin pulse "Recargar fixture" tras desplegar).
- **Zonas horarias**: usar `date-fns-tz` (ya disponible vía `date-fns`) o cálculo manual por offset fijo de junio/julio 2026 (todas las sedes están en horario de verano en esas fechas, offsets estables).

## Cuestión abierta

Si algún usuario ya cargó pronósticos sobre los partidos duplicados/erróneos actuales, al borrar `matches` se perderán esos pronósticos. Como el torneo aún no empezó y los datos actuales están mal, lo razonable es **borrar todo y empezar limpio**, pero confirmá si preferís preservar pronósticos intentando hacer match por nombres de equipos antes de borrar.

## Resultado esperado

- 104 partidos correctos, sin duplicados, con horarios UTC precisos.
- Banderas de país estándar ya funcionando vía el helper existente.
- Fixture deja de depender de una API externa inestable.
