-- DDA-052: persist the authoritative source data mode used by the source catalog.
ALTER TABLE "dda"."dataset_sources"
  ADD COLUMN "data_mode" VARCHAR(16);

UPDATE "dda"."dataset_sources" AS source
SET "data_mode" = artifact."data_mode"
FROM "iae"."artifact_versions" AS artifact
WHERE artifact."id" = source."iae_artifact_version_id";

ALTER TABLE "dda"."dataset_sources"
  ALTER COLUMN "data_mode" SET NOT NULL;

ALTER TABLE "dda"."dataset_sources"
  ADD CONSTRAINT "dataset_sources_data_mode_check"
  CHECK ("data_mode" IN ('CLOUD', 'HYBRID', 'LOCAL'));

-- One source has one canonical active assignment for each tenant ancestry.
-- Reassignments across datasets or projects must retire the prior row first.
CREATE UNIQUE INDEX "source_assignments_active_scope_source_key"
  ON "dda"."source_assignments" (
    "organization_id",
    "workspace_id",
    "source_id"
  )
  WHERE "status" = 'ACTIVE';
