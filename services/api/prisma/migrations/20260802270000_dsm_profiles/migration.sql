-- DSM-011: persist value-free profile disclosure metadata.
CREATE TABLE "dsm"."dataset_profiles" (
    "id" UUID NOT NULL,
    "dataset_version_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "completeness" VARCHAR(32) NOT NULL,
    "sampling_method" VARCHAR(96) NOT NULL,
    "sampling_seed" CHAR(64),
    "excluded_scopes" JSONB NOT NULL,
    "row_count_scanned" BIGINT NOT NULL,
    "row_count_available" BIGINT,
    "max_rows" BIGINT NOT NULL,
    "max_bytes" BIGINT NOT NULL,
    "max_duration_ms" BIGINT NOT NULL,
    "profile_fingerprint" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dataset_profiles_dataset_version_idx"
    ON "dsm"."dataset_profiles"("dataset_version_id");

CREATE INDEX "dataset_profiles_scope_idx"
    ON "dsm"."dataset_profiles"("organization_id", "workspace_id", "project_id", "dataset_version_id");
