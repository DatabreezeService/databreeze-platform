-- DSO-003/004/005: durable content-free capabilities and typed operational grants.
CREATE TABLE "dso"."device_capabilities" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "capability_type" VARCHAR(32) NOT NULL,
    "opaque_local_handle" VARCHAR(512),
    "constraint_digest" VARCHAR(128) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "reported_at" TIMESTAMPTZ(6) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "device_capabilities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "device_capabilities_org_device_status_idx"
  ON "dso"."device_capabilities"("organization_id", "device_id", "status");
CREATE INDEX "device_capabilities_device_reported_idx"
  ON "dso"."device_capabilities"("device_id", "reported_at");

CREATE TABLE "dso"."device_operational_grants" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "capability_id" UUID NOT NULL,
    "authorization_epoch" INTEGER NOT NULL,
    "allowed_action_types" JSONB NOT NULL,
    "allowed_data_classifications" JSONB NOT NULL,
    "synchronization_payload_classes" JSONB NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "status" VARCHAR(16) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "device_operational_grants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "device_operational_grants_scope_status_idx"
  ON "dso"."device_operational_grants"("organization_id", "workspace_id", "device_id", "status");
CREATE INDEX "device_operational_grants_device_expiry_idx"
  ON "dso"."device_operational_grants"("device_id", "expires_at");
CREATE INDEX "device_operational_grants_capability_idx"
  ON "dso"."device_operational_grants"("capability_id");
