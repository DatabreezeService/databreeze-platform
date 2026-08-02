-- DSO-008/026: durable immutable workspace data-mode policies.
CREATE TABLE "dso"."device_data_mode_policies" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "mode" VARCHAR(16) NOT NULL,
    "allowed_payload_classes" JSONB NOT NULL,
    "allowed_placement_kinds" JSONB NOT NULL,
    "allowed_executor_classes" JSONB NOT NULL,
    "allowed_destination_classes" JSONB NOT NULL,
    "canonical_hash" VARCHAR(64) NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "device_data_mode_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_data_mode_policies_policy_revision_key"
  ON "dso"."device_data_mode_policies"("policy_id", "revision");
CREATE INDEX "device_data_mode_policies_scope_idx"
  ON "dso"."device_data_mode_policies"("organization_id", "workspace_id", "policy_id", "revision");
