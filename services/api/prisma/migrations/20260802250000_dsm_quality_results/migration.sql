CREATE TABLE "dsm"."dataset_quality_results" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "dataset_version_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "rule_set_version_id" UUID NOT NULL,
    "profile_fingerprint" CHAR(64) NOT NULL,
    "row_count_scanned" BIGINT NOT NULL,
    "quality_state" VARCHAR(24) NOT NULL,
    "findings" JSONB NOT NULL,
    "result_fingerprint" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_quality_results_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dataset_quality_results_dataset_version_idx"
  ON "dsm"."dataset_quality_results"("dataset_version_id");
CREATE INDEX "dataset_quality_results_scope_idx"
  ON "dsm"."dataset_quality_results"("organization_id", "workspace_id", "project_id", "dataset_version_id");
