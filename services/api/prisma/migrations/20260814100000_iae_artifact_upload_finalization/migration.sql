-- IAE-022 / IAE-023: persist the server-owned upload admission snapshot and
-- the exact verified object version used by the finalization CAS.
-- Existing resumable sessions cannot be authorized against the current policy
-- because they predate the immutable admission snapshot, so they are expired
-- before the new column becomes required.
UPDATE "iae"."artifact_upload_sessions"
SET "state" = 'EXPIRED', "revision" = "revision" + 1
WHERE "state" IN ('OPEN', 'FINALIZING');

ALTER TABLE "iae"."artifact_upload_sessions"
  ADD COLUMN "admission" JSONB,
  ADD COLUMN "verified_object" JSONB;

UPDATE "iae"."artifact_upload_sessions"
SET "admission" = jsonb_build_object(
  'artifactVersionId', "artifact_id",
  'intakeId', "artifact_id",
  'policyVersionId', '00000000-0000-0000-0000-000000000000',
  'authorizationEpoch', 0
)
WHERE "admission" IS NULL;

ALTER TABLE "iae"."artifact_upload_sessions"
  ALTER COLUMN "admission" SET NOT NULL;

ALTER TABLE "iae"."artifact_upload_sessions"
  ADD CONSTRAINT "artifact_upload_sessions_verified_object_state_check"
  CHECK (
    ("state" = 'COMPLETED' AND "verified_object" IS NOT NULL)
    OR ("state" <> 'COMPLETED' AND "verified_object" IS NULL)
  );
