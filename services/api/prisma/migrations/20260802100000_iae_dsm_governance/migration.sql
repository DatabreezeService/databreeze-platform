-- IAE/DSM governance expansion: intake identity, lineage, dataset versions, and reference entities.
ALTER TABLE "iae"."artifact_versions"
  ADD COLUMN "scan_state" VARCHAR(16) NOT NULL DEFAULT 'PENDING';

CREATE TABLE "iae"."inbox_items" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "artifact_version_id" UUID NOT NULL,
    "state" VARCHAR(24) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "inbox_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inbox_items_scope_idempotency_key"
  ON "iae"."inbox_items"("organization_id", "workspace_id", "project_id", "idempotency_key");
CREATE INDEX "inbox_items_artifact_version_idx" ON "iae"."inbox_items"("artifact_version_id");
CREATE INDEX "inbox_items_scope_state_idx" ON "iae"."inbox_items"("organization_id", "workspace_id", "project_id", "state");

CREATE TABLE "iae"."artifact_lineage" (
    "id" UUID NOT NULL,
    "derived_artifact_version_id" UUID NOT NULL,
    "source_version_ids" JSONB NOT NULL,
    "processor_version" VARCHAR(128) NOT NULL,
    "recipe_version" VARCHAR(128),
    "coordinate_lineage" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "artifact_lineage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "artifact_lineage_derived_version_idx" ON "iae"."artifact_lineage"("derived_artifact_version_id");

ALTER TABLE "dsm"."dataset_definitions"
  ADD COLUMN "canonical_hash" CHAR(64) NOT NULL DEFAULT repeat('0', 64);

CREATE TABLE "dsm"."dataset_versions" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "input_artifact_version_ids" JSONB NOT NULL,
    "schema_version_id" UUID NOT NULL,
    "mapping_version_id" UUID NOT NULL,
    "rule_set_version_id" UUID NOT NULL,
    "engine_build" VARCHAR(128) NOT NULL,
    "content_fingerprint" CHAR(64) NOT NULL,
    "row_count" BIGINT NOT NULL,
    "quality_state" VARCHAR(24) NOT NULL,
    "lineage_manifest_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dataset_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dataset_versions_dataset_version_key" ON "dsm"."dataset_versions"("dataset_id", "id");
CREATE INDEX "dataset_versions_scope_idx" ON "dsm"."dataset_versions"("organization_id", "workspace_id", "project_id", "dataset_id");

CREATE TABLE "dsm"."reference_entity_versions" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "entity_type" VARCHAR(32) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "roles" JSONB NOT NULL,
    "aliases" JSONB NOT NULL,
    "external_identifiers" JSONB NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "visibility" VARCHAR(16) NOT NULL,
    "canonical_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reference_entity_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reference_entity_versions_entity_version_key" ON "dsm"."reference_entity_versions"("entity_id", "id");
CREATE INDEX "reference_entities_scope_idx" ON "dsm"."reference_entity_versions"("organization_id", "workspace_id", "project_id", "entity_id");

CREATE TABLE "dsm"."reference_entity_resolutions" (
    "id" UUID NOT NULL,
    "source_entity_id" UUID NOT NULL,
    "target_entity_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "reason" VARCHAR(512) NOT NULL,
    "evidence_id" UUID NOT NULL,
    "resolved_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "reference_entity_resolutions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reference_entity_resolutions_source_idx" ON "dsm"."reference_entity_resolutions"("source_entity_id");
CREATE INDEX "reference_entity_resolutions_target_idx" ON "dsm"."reference_entity_resolutions"("target_entity_id");
