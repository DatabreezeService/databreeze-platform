-- AUD-015/016: independent seal attestation storage.
CREATE TABLE "aud"."audit_seal_attestations" (
    "id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "scope_key" VARCHAR(200) NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "first_sequence" INTEGER NOT NULL,
    "last_sequence" INTEGER NOT NULL,
    "event_count" INTEGER NOT NULL,
    "root_digest" VARCHAR(512) NOT NULL,
    "sealed_at" TIMESTAMPTZ(6) NOT NULL,
    "signer_key_id" VARCHAR(200) NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" VARCHAR(2048) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_seal_attestations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_attestations_scope_idx"
ON "aud"."audit_seal_attestations"("organization_id", "workspace_id", "project_id", "last_sequence");
