-- DSM-022: persist governed export verification metadata without raw rows.
CREATE TABLE "dsm"."dataset_export_manifests" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "dataset_version_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "data_mode" VARCHAR(16) NOT NULL,
    "payload_class" VARCHAR(32) NOT NULL,
    "format" VARCHAR(16) NOT NULL,
    "row_count" BIGINT NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "schema_version_id" UUID NOT NULL,
    "mapping_version_id" UUID NOT NULL,
    "rule_set_version_id" UUID NOT NULL,
    "semantic_manifest_hash" CHAR(64) NOT NULL,
    "metric_manifest_hash" CHAR(64) NOT NULL,
    "quality_manifest_hash" CHAR(64) NOT NULL,
    "lineage_manifest_hash" CHAR(64) NOT NULL,
    "evidence_manifest_hash" CHAR(64) NOT NULL,
    "policy_hash" CHAR(64) NOT NULL,
    "quality_state" VARCHAR(24) NOT NULL,
    "approval_state" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_export_manifests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dataset_export_manifests_dataset_version_idx"
    ON "dsm"."dataset_export_manifests"("dataset_version_id");
CREATE INDEX "dataset_export_manifests_scope_idx"
    ON "dsm"."dataset_export_manifests"("organization_id", "workspace_id", "project_id", "dataset_version_id");
