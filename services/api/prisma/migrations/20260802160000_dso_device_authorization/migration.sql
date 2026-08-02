-- IAM-020, DSO-005: durable authorization snapshots and revocable opaque grants.
CREATE TABLE "dso"."device_authorization_snapshots" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "authorization_epoch" INTEGER NOT NULL,
    "snapshot_revision" INTEGER NOT NULL,
    "permissions" JSONB NOT NULL,
    "data_mode" VARCHAR(16) NOT NULL,
    "payload" VARCHAR(16384) NOT NULL,
    "signature" VARCHAR(1024) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "device_authorization_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_authorization_snapshots_device_revision_key"
  ON "dso"."device_authorization_snapshots"("device_id", "snapshot_revision");
CREATE INDEX "device_authorization_snapshots_scope_device_idx"
  ON "dso"."device_authorization_snapshots"("organization_id", "workspace_id", "project_id", "device_id");
CREATE INDEX "device_authorization_snapshots_device_expiry_idx"
  ON "dso"."device_authorization_snapshots"("device_id", "expires_at");

CREATE TABLE "dso"."device_grants" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "binding_id" UUID NOT NULL,
    "capability_digest" VARCHAR(128) NOT NULL,
    "authorization_epoch" INTEGER NOT NULL,
    "effects" JSONB NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "device_grants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "device_grants_scope_device_status_idx"
  ON "dso"."device_grants"("organization_id", "workspace_id", "project_id", "device_id", "status");
CREATE INDEX "device_grants_device_expiry_idx"
  ON "dso"."device_grants"("device_id", "expires_at");
