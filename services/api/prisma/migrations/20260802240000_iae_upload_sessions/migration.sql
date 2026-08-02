CREATE TABLE "iae"."artifact_upload_sessions" (
    "id" UUID NOT NULL,
    "artifact_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "expected_sha256" CHAR(64) NOT NULL,
    "expected_byte_size" BIGINT NOT NULL,
    "media_type" VARCHAR(255) NOT NULL,
    "part_size" INTEGER NOT NULL,
    "total_parts" INTEGER NOT NULL,
    "parts" JSONB NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "artifact_upload_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "artifact_upload_sessions_artifact_idx"
  ON "iae"."artifact_upload_sessions"("artifact_id");
CREATE INDEX "artifact_upload_sessions_scope_state_idx"
  ON "iae"."artifact_upload_sessions"("organization_id", "workspace_id", "project_id", "state");
CREATE INDEX "artifact_upload_sessions_expiry_idx"
  ON "iae"."artifact_upload_sessions"("expires_at");
