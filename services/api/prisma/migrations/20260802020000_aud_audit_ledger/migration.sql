-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "aud";

-- Register the module-owned schema without replacing an existing owner.
INSERT INTO "platform"."schema_registry" ("schema_name", "owner_module")
VALUES ('aud', 'AUD')
ON CONFLICT ("schema_name") DO NOTHING;

-- CreateTable
CREATE TABLE "aud"."audit_events" (
    "id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "scope_key" VARCHAR(200) NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "actor_type" VARCHAR(24) NOT NULL,
    "actor_id" UUID NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" UUID NOT NULL,
    "entity_revision" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "correlation_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "summary" JSONB NOT NULL,
    "previous_digest" VARCHAR(512),
    "digest" VARCHAR(512) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aud"."audit_seals" (
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
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_seals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_scope_sequence_key" ON "aud"."audit_events"("scope_key", "sequence");
CREATE UNIQUE INDEX "audit_events_scope_idempotency_key" ON "aud"."audit_events"("scope_key", "idempotency_key");
CREATE INDEX "audit_events_scope_idx" ON "aud"."audit_events"("organization_id", "workspace_id", "project_id", "sequence");
CREATE INDEX "audit_events_entity_idx" ON "aud"."audit_events"("entity_id");
CREATE UNIQUE INDEX "audit_seals_scope_range_key" ON "aud"."audit_seals"("scope_key", "first_sequence", "last_sequence");
CREATE INDEX "audit_seals_scope_idx" ON "aud"."audit_seals"("organization_id", "workspace_id", "project_id", "last_sequence");
