-- Harden nullable-scope uniqueness and complete tenant ancestry added after the
-- initial governance tables. PostgreSQL NULLs do not participate in a normal
-- unique index, so each scope level gets an explicit partial unique index.
UPDATE "iae"."artifact_lineage" AS lineage
SET
  "scope_type" = versions."scope_type",
  "organization_id" = versions."organization_id",
  "workspace_id" = versions."workspace_id",
  "project_id" = versions."project_id"
FROM "iae"."artifact_versions" AS versions
WHERE lineage."derived_artifact_version_id" = versions."id"
  AND lineage."organization_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "iae"."artifact_lineage" WHERE "organization_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'artifact lineage rows must resolve to an artifact tenant';
  END IF;
END $$;

ALTER TABLE "iae"."artifact_lineage"
  ALTER COLUMN "organization_id" SET NOT NULL;

UPDATE "dsm"."reference_entity_resolutions" AS resolutions
SET
  "scope_type" = versions."scope_type",
  "organization_id" = versions."organization_id",
  "workspace_id" = versions."workspace_id",
  "project_id" = versions."project_id"
FROM "dsm"."reference_entity_versions" AS versions
WHERE resolutions."source_entity_id" = versions."entity_id"
  AND resolutions."organization_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "dsm"."reference_entity_resolutions" WHERE "organization_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'reference entity resolution rows must resolve to an entity tenant';
  END IF;
END $$;

ALTER TABLE "dsm"."reference_entity_resolutions"
  ALTER COLUMN "organization_id" SET NOT NULL;

CREATE UNIQUE INDEX "inbox_items_organization_idempotency_key"
  ON "iae"."inbox_items"("organization_id", "idempotency_key")
  WHERE "scope_type" = 'organization' AND "workspace_id" IS NULL AND "project_id" IS NULL;
CREATE UNIQUE INDEX "inbox_items_workspace_idempotency_key"
  ON "iae"."inbox_items"("organization_id", "workspace_id", "idempotency_key")
  WHERE "scope_type" = 'workspace' AND "workspace_id" IS NOT NULL AND "project_id" IS NULL;
CREATE UNIQUE INDEX "inbox_items_project_idempotency_key"
  ON "iae"."inbox_items"("organization_id", "workspace_id", "project_id", "idempotency_key")
  WHERE "scope_type" = 'project' AND "workspace_id" IS NOT NULL AND "project_id" IS NOT NULL;
