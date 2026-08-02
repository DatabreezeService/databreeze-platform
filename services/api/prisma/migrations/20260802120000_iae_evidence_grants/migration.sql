-- IAE-005/IAE-006: expiring device-bound evidence grants.
CREATE TABLE "iae"."evidence_grants" (
    "id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "artifact_version_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "recipient_device_id" UUID NOT NULL,
    "action" VARCHAR(24) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "authorization_epoch" INTEGER NOT NULL,
    "max_excerpt_bytes" INTEGER NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    CONSTRAINT "evidence_grants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "evidence_grants_evidence_idx" ON "iae"."evidence_grants"("evidence_id");
CREATE INDEX "evidence_grants_artifact_version_idx" ON "iae"."evidence_grants"("artifact_version_id");
CREATE INDEX "evidence_grants_scope_device_idx" ON "iae"."evidence_grants"("organization_id", "workspace_id", "project_id", "recipient_device_id");
