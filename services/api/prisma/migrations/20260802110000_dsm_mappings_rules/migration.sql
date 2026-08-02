-- DSM mappings/rules and explicit tenant scope for governance decisions.
ALTER TABLE "iae"."artifact_lineage"
  ADD COLUMN "scope_type" VARCHAR(24) NOT NULL DEFAULT 'workspace',
  ADD COLUMN "organization_id" UUID,
  ADD COLUMN "workspace_id" UUID,
  ADD COLUMN "project_id" UUID;
CREATE INDEX "artifact_lineage_scope_idx"
  ON "iae"."artifact_lineage"("organization_id", "workspace_id", "project_id");

ALTER TABLE "dsm"."reference_entity_resolutions"
  ADD COLUMN "scope_type" VARCHAR(24) NOT NULL DEFAULT 'workspace',
  ADD COLUMN "organization_id" UUID,
  ADD COLUMN "workspace_id" UUID,
  ADD COLUMN "project_id" UUID;
CREATE INDEX "reference_entity_resolutions_scope_idx"
  ON "dsm"."reference_entity_resolutions"("organization_id", "workspace_id", "project_id");

CREATE TABLE "dsm"."mapping_definitions" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "source_schema_version_id" UUID NOT NULL,
    "target_schema_version_id" UUID NOT NULL,
    "steps" JSONB NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "canonical_hash" CHAR(64) NOT NULL,
    CONSTRAINT "mapping_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mapping_definitions_dataset_version_key" ON "dsm"."mapping_definitions"("dataset_id", "id");
CREATE INDEX "mapping_definitions_scope_idx" ON "dsm"."mapping_definitions"("organization_id", "workspace_id", "project_id", "dataset_id");

CREATE TABLE "dsm"."rule_set_definitions" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "schema_version_id" UUID NOT NULL,
    "rules" JSONB NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "canonical_hash" CHAR(64) NOT NULL,
    CONSTRAINT "rule_set_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rule_set_definitions_dataset_version_key" ON "dsm"."rule_set_definitions"("dataset_id", "id");
CREATE INDEX "rule_set_definitions_scope_idx" ON "dsm"."rule_set_definitions"("organization_id", "workspace_id", "project_id", "dataset_id");
