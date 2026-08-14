-- Executable deployment preflight for 20260813010000_dda_dashboard_publications.
-- Run this as the migration operator before migration.sql. The application
-- admission block and all legacy SHARED_LINK writers must be stopped first.
-- Existing SHARED_LINK rows are reported, not deleted or widened; they keep
-- the NOT VALID constraint unvalidated until the later operator gate.

DO $$
BEGIN
  IF current_setting('databreeze.dda_publication_admission_blocked', true)
       IS DISTINCT FROM 'on'
     OR current_setting('databreeze.dda_legacy_publication_writers_stopped', true)
       IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'DDA publication preflight requires admission block and legacy writers stopped before migration';
  END IF;
END
$$;

SELECT
  COUNT(*) AS legacy_shared_link_rows,
  COALESCE(MIN(created_at), TIMESTAMPTZ 'epoch') AS oldest_legacy_shared_link
FROM "dda"."dashboard_snapshots"
WHERE "audience" = 'SHARED_LINK';

SELECT
  current_setting('databreeze.dda_publication_admission_blocked', true)
    AS publication_admission_blocked,
  current_setting('databreeze.dda_legacy_publication_writers_stopped', true)
    AS legacy_publication_writers_stopped;
