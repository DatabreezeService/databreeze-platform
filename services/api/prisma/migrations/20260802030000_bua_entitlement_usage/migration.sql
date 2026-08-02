-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "bua";

-- Register the module-owned schema without replacing an existing owner.
INSERT INTO "platform"."schema_registry" ("schema_name", "owner_module")
VALUES ('bua', 'BUA')
ON CONFLICT ("schema_name") DO NOTHING;

-- CreateTable
CREATE TABLE "bua"."entitlement_plans" (
    "plan_code" VARCHAR(40) NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "display_name_key" VARCHAR(120) NOT NULL,
    "features" JSONB NOT NULL,
    "quotas" JSONB NOT NULL,
    "provider_independent" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_plans_pkey" PRIMARY KEY ("plan_code")
);

-- CreateTable
CREATE TABLE "bua"."entitlement_snapshots" (
    "id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "scope_key" VARCHAR(200) NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "plan_code" VARCHAR(40) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "revision" INTEGER NOT NULL,
    "security_epoch" INTEGER NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "features" JSONB NOT NULL,
    "quotas" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bua"."usage_ledger_entries" (
    "id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "scope_key" VARCHAR(200) NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "metric" VARCHAR(40) NOT NULL,
    "bucket" VARCHAR(16) NOT NULL,
    "delta_units" BIGINT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "reservation_id" UUID,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bua"."usage_reservations" (
    "id" UUID NOT NULL,
    "scope_key" VARCHAR(200) NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "metric" VARCHAR(40) NOT NULL,
    "reserved_units" BIGINT NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "revision" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usage_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_snapshots_scope_revision_key" ON "bua"."entitlement_snapshots"("scope_key", "revision");
CREATE INDEX "entitlement_snapshots_scope_idx" ON "bua"."entitlement_snapshots"("organization_id", "workspace_id", "revision");
CREATE INDEX "entitlement_snapshots_plan_idx" ON "bua"."entitlement_snapshots"("plan_code");
CREATE UNIQUE INDEX "usage_ledger_scope_metric_sequence_key" ON "bua"."usage_ledger_entries"("scope_key", "metric", "sequence");
CREATE UNIQUE INDEX "usage_ledger_scope_idempotency_key" ON "bua"."usage_ledger_entries"("scope_key", "idempotency_key");
CREATE INDEX "usage_ledger_scope_idx" ON "bua"."usage_ledger_entries"("organization_id", "workspace_id", "metric", "sequence");
CREATE INDEX "usage_ledger_reservation_idx" ON "bua"."usage_ledger_entries"("reservation_id");
CREATE INDEX "usage_reservations_scope_idx" ON "bua"."usage_reservations"("organization_id", "workspace_id", "status");
CREATE INDEX "usage_reservations_metric_idx" ON "bua"."usage_reservations"("scope_key", "metric");
