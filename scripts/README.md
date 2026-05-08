# Load testing del Prode

Simula N usuarios reales conectados al mismo tiempo consumiendo la app.

## Requisitos
Los 100 usuarios `loadtest+1@prode.test` … `loadtest+100@prode.test` ya existen en la base con password `LoadTest123!` y están aprobados.

## Ejecutar

```bash
# defaults: 100 usuarios, 60s, poll cada 5s
bun run scripts/loadtest.ts

# custom
CONCURRENCY=50 DURATION_SEC=120 POLL_MS=3000 bun run scripts/loadtest.ts
```

Mientras corre, abrí la app logueado como **chueca@gmail.com / Prueba123** y mirá las pestañas Live / Ranking / Predictions para ver cómo responde la UI bajo carga.

## Limpieza
Cuando termines, podés borrar los 100 usuarios de prueba ejecutando en la base:

```sql
DO $$
DECLARE u record;
BEGIN
  FOR u IN SELECT id FROM auth.users WHERE email LIKE 'loadtest+%@prode.test' LOOP
    DELETE FROM public.predictions WHERE user_id = u.id;
    DELETE FROM public.user_roles WHERE user_id = u.id;
    DELETE FROM public.profiles WHERE id = u.id;
    DELETE FROM auth.identities WHERE user_id = u.id;
    DELETE FROM auth.users WHERE id = u.id;
  END LOOP;
END $$;
```
