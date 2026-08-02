-- DSO-001..DSO-027: device synchronization, explicit conflicts, and strict-Local handoff.
CREATE SCHEMA IF NOT EXISTS "dso";

CREATE TABLE "dso"."device_sync_operations" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "device_id" UUID NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "payload_class" VARCHAR(40) NOT NULL,
    "payload_digest" VARCHAR(128) NOT NULL,
    "encrypted_payload" VARCHAR(16384),
    "dependency_ids" JSONB NOT NULL,
    "base_revision" INTEGER,
    "status" VARCHAR(16) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6),
    "idempotency_key" VARCHAR(200) NOT NULL,
    CONSTRAINT "device_sync_operations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "device_sync_operations_scope_status_idx"
  ON "dso"."device_sync_operations"("organization_id", "workspace_id", "project_id", "status");
CREATE INDEX "device_sync_operations_device_created_idx"
  ON "dso"."device_sync_operations"("device_id", "created_at");
CREATE INDEX "device_sync_operations_entity_idx"
  ON "dso"."device_sync_operations"("entity_type", "entity_id");
CREATE UNIQUE INDEX "device_sync_operations_organization_idempotency_key"
  ON "dso"."device_sync_operations"("organization_id", "idempotency_key")
  WHERE "scope_type" = 'organization' AND "workspace_id" IS NULL AND "project_id" IS NULL;
CREATE UNIQUE INDEX "device_sync_operations_workspace_idempotency_key"
  ON "dso"."device_sync_operations"("organization_id", "workspace_id", "idempotency_key")
  WHERE "scope_type" = 'workspace' AND "workspace_id" IS NOT NULL AND "project_id" IS NULL;
CREATE UNIQUE INDEX "device_sync_operations_project_idempotency_key"
  ON "dso"."device_sync_operations"("organization_id", "workspace_id", "project_id", "idempotency_key")
  WHERE "scope_type" = 'project' AND "workspace_id" IS NOT NULL AND "project_id" IS NOT NULL;

CREATE TABLE "dso"."device_sync_conflicts" (
    "id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "device_id" UUID NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" UUID NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "expected_revision" INTEGER,
    "actual_revision" INTEGER,
    "detected_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    CONSTRAINT "device_sync_conflicts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "device_sync_conflicts_operation_reason_key"
  ON "dso"."device_sync_conflicts"("operation_id", "reason");
CREATE INDEX "device_sync_conflicts_scope_status_idx"
  ON "dso"."device_sync_conflicts"("organization_id", "workspace_id", "project_id", "status");
CREATE INDEX "device_sync_conflicts_device_detected_idx"
  ON "dso"."device_sync_conflicts"("device_id", "detected_at");

CREATE TABLE "dso"."strict_local_package_manifests" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "device_id" UUID NOT NULL,
    "purpose" VARCHAR(200) NOT NULL,
    "destination_class" VARCHAR(64) NOT NULL,
    "item_digests" JSONB NOT NULL,
    "package_digest" VARCHAR(128) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "strict_local_package_manifests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "strict_local_packages_scope_status_idx"
  ON "dso"."strict_local_package_manifests"("organization_id", "workspace_id", "project_id", "status");
CREATE INDEX "strict_local_packages_device_expiry_idx"
  ON "dso"."strict_local_package_manifests"("device_id", "expires_at");

CREATE TABLE "dso"."device_transfer_receipts" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "destination_class" VARCHAR(64) NOT NULL,
    "package_digest" VARCHAR(128) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "manifest_verified" BOOLEAN NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    CONSTRAINT "device_transfer_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "device_transfer_receipts_package_device_key"
  ON "dso"."device_transfer_receipts"("package_id", "device_id");
CREATE INDEX "device_transfer_receipts_device_received_idx"
  ON "dso"."device_transfer_receipts"("device_id", "received_at");

CREATE TABLE "dso"."local_audit_fragments" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "device_id" UUID NOT NULL,
    "fragment_digest" VARCHAR(128) NOT NULL,
    "encrypted_fragment_ref" VARCHAR(512) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "local_audit_fragments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "local_audit_fragments_device_digest_key"
  ON "dso"."local_audit_fragments"("device_id", "fragment_digest");
CREATE INDEX "local_audit_fragments_scope_status_idx"
  ON "dso"."local_audit_fragments"("organization_id", "workspace_id", "project_id", "status");
