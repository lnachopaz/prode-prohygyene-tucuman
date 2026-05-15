-- Abre todas las ventanas de fase de grupos inmediatamente.
-- Nuevo reglamento: todos los partidos de grupos ya están disponibles.
UPDATE public.prediction_windows
SET opens_at = '2026-05-15T00:00:00Z'
WHERE id IN ('matchday-2', 'matchday-3');
