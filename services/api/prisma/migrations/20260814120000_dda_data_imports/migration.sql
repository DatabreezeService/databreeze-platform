-- DDA-053/WEB-021: durable multi-source import review metadata.
CREATE TABLE "dda"."data_imports" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "revision" INTEGER NOT NULL,
    "state" VARCHAR(32) NOT NULL,
    "destination" VARCHAR(32) NOT NULL,
    "dataset_id" UUID,
    "dataset_name" VARCHAR(200) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "payload_fingerprint" CHAR(64) NOT NULL,
    "source_document" JSONB NOT NULL,
    "review_document" JSONB NOT NULL,
    "accepted_document" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "data_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "data_imports_scope_idempotency_key"
    ON "dda"."data_imports"("organization_id", "workspace_id", "project_id", "idempotency_key");
CREATE INDEX "data_imports_scope_created_idx"
    ON "dda"."data_imports"("organization_id", "workspace_id", "project_id", "created_at");
CREATE INDEX "data_imports_scope_state_idx"
    ON "dda"."data_imports"("organization_id", "workspace_id", "project_id", "state");

ALTER TABLE "dda"."data_imports"
    ADD CONSTRAINT "data_imports_scope_type_check"
    CHECK ("scope_type" IN ('organization', 'workspace', 'project'));
ALTER TABLE "dda"."data_imports"
    ADD CONSTRAINT "data_imports_revision_check"
    CHECK ("revision" >= 1);
ALTER TABLE "dda"."data_imports"
    ADD CONSTRAINT "data_imports_state_check"
    CHECK ("state" IN ('REVIEW_REQUIRED', 'REVISING', 'APPROVED', 'PROCESSING', 'READY', 'FAILED'));
ALTER TABLE "dda"."data_imports"
    ADD CONSTRAINT "data_imports_destination_check"
    CHECK ("destination" IN ('NEW_DATASET', 'EXISTING_DATASET'));
ALTER TABLE "dda"."data_imports"
    ADD CONSTRAINT "data_imports_fingerprint_check"
    CHECK ("payload_fingerprint" ~ '^[0-9a-f]{64}$');
