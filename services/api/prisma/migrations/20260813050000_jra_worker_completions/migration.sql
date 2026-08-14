-- JRA-007/JRA-008/JRA-023: durable attempt-bound completion replay records.
-- The record stores only opaque result references and safe hashes; no paths, credentials,
-- commands, or secret material are persisted.

CREATE TABLE "jra"."worker_completions" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "worker_id" UUID NOT NULL,
    "security_epoch" INTEGER NOT NULL,
    "lease_token_hash" CHAR(64) NOT NULL,
    "expected_revision" INTEGER NOT NULL,
    "completion_revision" INTEGER NOT NULL,
    "outcome" VARCHAR(16) NOT NULL,
    "result_manifest_hash" CHAR(64),
    "result_references" JSONB NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "worker_completions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "worker_completions_fingerprint_key"
  ON "jra"."worker_completions"("fingerprint");
CREATE UNIQUE INDEX "worker_completions_attempt_key"
  ON "jra"."worker_completions"("attempt_id");
CREATE INDEX "worker_completions_scope_time_idx"
  ON "jra"."worker_completions"("organization_id", "workspace_id", "project_id", "created_at");
