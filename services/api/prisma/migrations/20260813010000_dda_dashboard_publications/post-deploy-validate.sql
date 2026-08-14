-- Later ordered operator validation gate. Do not run in the rolling
-- deployment transaction and do not fold this into migration.sql.
-- Preconditions: preflight.sql passed; old SHARED_LINK writers are stopped;
-- the admission block remains enabled; and legacy SHARED_LINK rows have been
-- remediated by an approved policy migration (or the operator has confirmed
-- that the check can be validated).

DO $$
BEGIN
  IF current_setting('databreeze.dda_publication_admission_blocked', true)
       IS DISTINCT FROM 'on'
     OR current_setting('databreeze.dda_legacy_publication_writers_stopped', true)
       IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'DDA publication validation requires admission block and legacy writers stopped';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "dda"."dashboard_snapshots"
    WHERE "audience" = 'SHARED_LINK'
  ) THEN
    RAISE EXCEPTION
      'DDA publication validation is blocked by legacy SHARED_LINK rows';
  END IF;
END
$$;

ALTER TABLE "dda"."dashboard_snapshots"
  VALIDATE CONSTRAINT "dashboard_snapshots_member_audience_check";
ALTER TABLE "dda"."dashboard_snapshots"
  VALIDATE CONSTRAINT "dashboard_snapshots_binding_proof_pair_check";
ALTER TABLE "dda"."dashboard_snapshots"
  VALIDATE CONSTRAINT "dashboard_snapshots_scope_version_fk";
ALTER TABLE "dda"."dashboard_refresh_state"
  VALIDATE CONSTRAINT "dashboard_refresh_state_scope_dashboard_fk";
ALTER TABLE "dda"."dashboard_refresh_state"
  VALIDATE CONSTRAINT "dashboard_refresh_state_scope_snapshot_fk";
