CREATE TABLE "jra"."job_dispatch_outbox" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "event_type" VARCHAR(32) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "delivered_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "job_dispatch_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_dispatch_job_idempotency_key" ON "jra"."job_dispatch_outbox"("job_id", "idempotency_key");
CREATE INDEX "job_dispatch_pending_idx" ON "jra"."job_dispatch_outbox"("organization_id", "workspace_id", "project_id", "delivered_at", "created_at");
CREATE INDEX "job_dispatch_job_event_idx" ON "jra"."job_dispatch_outbox"("job_id", "event_type");
