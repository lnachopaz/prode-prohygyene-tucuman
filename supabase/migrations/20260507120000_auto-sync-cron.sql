-- Auto-sync: cron jobs que llaman a las edge functions automáticamente.
-- sync-live-matches cada 5 min  → detecta inicio del partido (scheduled → live)
-- finalize-finished-matches cada 10 min → carga resultado final (live → finished)

CREATE EXTENSION IF NOT EXISTS pg_net;

-- sync-live-matches: cada 5 minutos
DO $$
BEGIN
  PERFORM cron.unschedule('auto-sync-live-matches');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto-sync-live-matches',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://cngsozkoikrjaozxjbtz.supabase.co/functions/v1/sync-live-matches',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNuZ3NvemtvaWtyamFvenhqYnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjQ1OTksImV4cCI6MjA5MzA0MDU5OX0.71US49JsH16CIX1wtVAhCukn3D51GeOv9__eBfaJLKo"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

-- finalize-finished-matches: cada 10 minutos
DO $$
BEGIN
  PERFORM cron.unschedule('auto-finalize-finished-matches');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto-finalize-finished-matches',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://cngsozkoikrjaozxjbtz.supabase.co/functions/v1/finalize-finished-matches',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNuZ3NvemtvaWtyamFvenhqYnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjQ1OTksImV4cCI6MjA5MzA0MDU5OX0.71US49JsH16CIX1wtVAhCukn3D51GeOv9__eBfaJLKo"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
