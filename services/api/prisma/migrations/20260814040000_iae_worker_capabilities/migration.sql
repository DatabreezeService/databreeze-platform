CREATE TABLE "iae"."worker_object_capability_records" (
    "id" UUID NOT NULL,
    "grant_type" VARCHAR(16) NOT NULL,
    "attempt_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "object_id" VARCHAR(256),
    "object_ids" JSONB NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "security_epoch" INTEGER NOT NULL,
    "max_bytes" BIGINT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "worker_object_capability_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "worker_object_capabilities_attempt_output_key"
    ON "iae"."worker_object_capability_records"("attempt_id", "grant_type", "object_id");
CREATE UNIQUE INDEX "worker_object_capabilities_attempt_input_key"
    ON "iae"."worker_object_capability_records"("attempt_id")
    WHERE "grant_type" = 'JOB_INPUT';
CREATE INDEX "worker_object_capabilities_job_attempt_idx"
    ON "iae"."worker_object_capability_records"("job_id", "attempt_id");
CREATE INDEX "worker_object_capabilities_scope_worker_idx"
    ON "iae"."worker_object_capability_records"("organization_id", "workspace_id", "project_id", "worker_id");
CREATE INDEX "worker_object_capabilities_expiry_idx"
    ON "iae"."worker_object_capability_records"("expires_at");

ALTER TABLE "iae"."worker_object_capability_records"
    ADD CONSTRAINT "worker_object_capability_records_grant_type_check"
    CHECK ("grant_type" IN ('JOB_INPUT', 'JOB_OUTPUT'));
ALTER TABLE "iae"."worker_object_capability_records"
    ADD CONSTRAINT "worker_object_capability_records_action_check"
    CHECK ("action" IN ('READ', 'WRITE'));
ALTER TABLE "iae"."worker_object_capability_records"
    ADD CONSTRAINT "worker_object_capability_records_object_binding_check"
    CHECK (
        ("grant_type" = 'JOB_INPUT' AND "object_id" IS NULL AND "action" = 'READ') OR
        ("grant_type" = 'JOB_OUTPUT' AND "object_id" IS NOT NULL AND "action" = 'WRITE')
    );
ALTER TABLE "iae"."worker_object_capability_records"
    ADD CONSTRAINT "worker_object_capability_records_expiry_check"
    CHECK ("expires_at" > "issued_at");
