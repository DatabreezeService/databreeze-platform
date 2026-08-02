CREATE TABLE "jra"."result_manifests" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "source_artifact_version_ids" JSONB NOT NULL,
    "output_ids" JSONB NOT NULL,
    "output_hashes" JSONB NOT NULL,
    "evidence_coverage" VARCHAR(16) NOT NULL,
    "handler_digest" CHAR(64) NOT NULL,
    "engine_version" VARCHAR(128) NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "reviewer_id" UUID,
    "approval_state" VARCHAR(16) NOT NULL,
    "manifest_hash" CHAR(64) NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "result_manifests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "result_manifests_attempt_key" ON "jra"."result_manifests"("attempt_id");
CREATE INDEX "result_manifests_scope_time_idx" ON "jra"."result_manifests"("organization_id", "workspace_id", "project_id", "generated_at");
CREATE INDEX "result_manifests_job_attempt_idx" ON "jra"."result_manifests"("job_id", "attempt_number");
