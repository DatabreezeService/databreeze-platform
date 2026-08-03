-- IAE-016, IAE-018, IAE-021: durable retention requests and verification manifests.
CREATE TABLE "iae"."artifact_deletion_requests" (
    "id" UUID NOT NULL,
    "artifact_version_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "blockers" JSONB NOT NULL,
    "authorized_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "artifact_deletion_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "artifact_deletion_requests_artifact_idx" ON "iae"."artifact_deletion_requests"("artifact_version_id");
CREATE INDEX "artifact_deletion_requests_scope_state_idx" ON "iae"."artifact_deletion_requests"("organization_id", "workspace_id", "project_id", "state");

CREATE TABLE "iae"."artifact_export_manifests" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "entries" JSONB NOT NULL,
    "approval_state" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "canonical_hash" CHAR(64) NOT NULL,
    CONSTRAINT "artifact_export_manifests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "artifact_export_manifests_scope_idx" ON "iae"."artifact_export_manifests"("organization_id", "workspace_id", "project_id");
