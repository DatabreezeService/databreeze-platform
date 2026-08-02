CREATE TABLE "jra"."execution_attempts" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "attempt_number" INTEGER NOT NULL,
    "executor_type" VARCHAR(24) NOT NULL,
    "executor_id" UUID NOT NULL,
    "lease_token_hash" CHAR(64) NOT NULL,
    "lease_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "heartbeat_at" TIMESTAMPTZ(6) NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "result_manifest_hash" CHAR(64),
    "revision" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "execution_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "execution_attempts_job_number_key" ON "jra"."execution_attempts"("job_id", "attempt_number");
CREATE INDEX "execution_attempts_scope_state_lease_idx" ON "jra"."execution_attempts"("organization_id", "workspace_id", "project_id", "state", "lease_expires_at");
CREATE INDEX "execution_attempts_job_revision_idx" ON "jra"."execution_attempts"("job_id", "revision");
