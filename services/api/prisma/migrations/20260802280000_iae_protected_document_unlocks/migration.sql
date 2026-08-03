-- IAE-015: persist unlock request state only; credentials remain local/ephemeral.
CREATE TABLE "iae"."protected_document_unlock_requests" (
    "id" UUID NOT NULL,
    "artifact_version_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "device_id" UUID,
    "mode" VARCHAR(24) NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "attempt_count" INTEGER NOT NULL,
    "max_attempts" INTEGER NOT NULL,
    "last_failure_code" VARCHAR(32),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "protected_document_unlock_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "protected_document_unlock_artifact_idx"
    ON "iae"."protected_document_unlock_requests"("artifact_version_id");
CREATE INDEX "protected_document_unlock_scope_state_idx"
    ON "iae"."protected_document_unlock_requests"("organization_id", "workspace_id", "project_id", "state");
CREATE INDEX "protected_document_unlock_expiry_idx"
    ON "iae"."protected_document_unlock_requests"("expires_at");
