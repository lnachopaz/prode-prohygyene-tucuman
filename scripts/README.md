# Load testing del Prode

Simula N usuarios reales conectados al mismo tiempo consumiendo la app.

## Requisitos previos — Seed de 500 usuarios

Los usuarios `loadtest+1@prode.test` … `loadtest+500@prode.test` deben existir en la base con password `LoadTest123!` y status `approved`.

### Paso 1 — Ejecutar el seed en Supabase SQL Editor

Abrí el SQL Editor de tu proyecto Supabase y ejecutá el contenido de `scripts/seed-stress-test.sql`.

- Crea los 500 usuarios en `auth.users` + `auth.identities` (salta los que ya existen)
- Marca cada perfil como `approved` y `show_in_ranking = false` (no contamina el ranking real)
- Genera pronósticos aleatorios para todos los partidos (con puntos calculados para los partidos ya finalizados)
- Al final muestra cuántos usuarios y pronósticos quedaron en la base

Duración estimada: 10–30 segundos.

---

## Test de carga — loadtest.ts

Simula N usuarios navegando la app simultáneamente (leaderboard + partidos + predicciones).

```bash
# defaults: 100 usuarios, 60s, poll cada 5s
bun run scripts/loadtest.ts

# 500 usuarios por 2 minutos
CONCURRENCY=500 DURATION_SEC=120 bun run scripts/loadtest.ts

# custom
CONCURRENCY=200 DURATION_SEC=90 POLL_MS=3000 bun run scripts/loadtest.ts
```

Mientras corre, abrí la app logueado como **chueca@gmail.com / Prueba123** y mirá las pestañas Live / Ranking / Predictions para ver cómo responde la UI bajo carga.

---

## Test de burst — burst-predictions.ts

Simula el momento crítico antes de un partido: N usuarios cargan pronósticos al mismo tiempo.

```bash
# defaults: 50 usuarios, 3 pronósticos por usuario
bun run scripts/burst-predictions.ts

# 500 usuarios en burst
USERS=500 MATCHES_PER=5 bun run scripts/burst-predictions.ts
```

---

## Limpieza — borrar los 500 usuarios de prueba

Ejecutá en el SQL Editor de Supabase cuando termines:

```sql
DO $$
DECLARE u record;
BEGIN
  FOR u IN SELECT id FROM auth.users WHERE email LIKE 'loadtest+%@prode.test' LOOP
    DELETE FROM public.predictions WHERE user_id = u.id;
    DELETE FROM public.user_roles  WHERE user_id = u.id;
    DELETE FROM public.profiles    WHERE id = u.id;
    DELETE FROM auth.identities    WHERE user_id = u.id;
    DELETE FROM auth.users         WHERE id = u.id;
  END LOOP;
  RAISE NOTICE 'Usuarios de prueba eliminados';
END $$;
```

---

## Qué medir

| Métrica | Verde | Amarillo | Rojo |
|---|---|---|---|
| Latencia media | < 200 ms | 200–500 ms | > 500 ms |
| Latencia p95 | < 500 ms | 500 ms–1 s | > 1 s |
| Errores | 0% | < 1% | > 1% |

Si el leaderboard con 500 usuarios tarda mucho, el siguiente paso es agregar un índice en `predictions(user_id)` y revisar el EXPLAIN de la view.
