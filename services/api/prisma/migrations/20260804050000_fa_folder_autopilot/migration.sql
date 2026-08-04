-- FA-001..FA-007: Folder Autopilot stores typed settings and opaque DSO/JRA references only.
CREATE SCHEMA IF NOT EXISTS "fa";

INSERT INTO "platform"."schema_registry" ("schema_name", "owner_module")
VALUES ('fa', 'folder-autopilot')
ON CONFLICT ("schema_name") DO NOTHING;

CREATE TABLE "fa"."folder_autopilot_profiles" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "version" INTEGER NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "stabilization_delay_ms" INTEGER NOT NULL,
    "max_files_per_scan" INTEGER NOT NULL,
    "collision_policy" VARCHAR(16) NOT NULL,
    "undo_window_seconds" INTEGER NOT NULL,
    "output_lineage_enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "folder_autopilot_profiles_pkey" PRIMARY KEY ("id", "version")
);
CREATE INDEX "folder_autopilot_profiles_scope_idx"
  ON "fa"."folder_autopilot_profiles" ("organization_id", "workspace_id", "project_id", "id", "version");

CREATE TABLE "fa"."autopilot_folder_bindings" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "device_grant_id" UUID NOT NULL,
    "role" VARCHAR(8) NOT NULL,
    "expected_capability_digest" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "autopilot_folder_bindings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "autopilot_folder_bindings_scope_role_idx"
  ON "fa"."autopilot_folder_bindings" ("organization_id", "workspace_id", "project_id", "role");
CREATE INDEX "autopilot_folder_bindings_device_grant_idx"
  ON "fa"."autopilot_folder_bindings" ("device_grant_id");

CREATE TABLE "fa"."recipe_assignments" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "profile_id" UUID NOT NULL,
    "profile_version" INTEGER NOT NULL,
    "profile_hash" CHAR(64) NOT NULL,
    "jra_recipe_version_id" UUID NOT NULL,
    "jra_recipe_version_hash" CHAR(64) NOT NULL,
    "device_id" UUID NOT NULL,
    "input_binding_ids" JSONB NOT NULL,
    "output_binding_ids" JSONB NOT NULL,
    "data_mode_constraint" VARCHAR(16),
    "effective_data_mode_policy_ref" UUID,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "recipe_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recipe_assignments_scope_idempotency_key"
  ON "fa"."recipe_assignments" ("organization_id", "workspace_id", "project_id", "idempotency_key");
CREATE INDEX "recipe_assignments_scope_state_idx"
  ON "fa"."recipe_assignments" ("organization_id", "workspace_id", "project_id", "state");
CREATE INDEX "recipe_assignments_device_state_idx"
  ON "fa"."recipe_assignments" ("device_id", "state");
