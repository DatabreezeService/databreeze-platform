-- DDA-001 foundation persistence for dashboard-agent metadata.
-- Rollback:
-- 1. Stop DDA admission and new DDA writes.
-- 2. Retain IAE/DSM/JRA/DSO/BUA/AUD records. Never delete IAE content or AUD history.
-- 3. Export any retained DDA metadata needed for support.
-- 4. Drop only empty/unpublished DDA tables in reverse dependency order, then drop schema dda.
-- ROLLBACK order (empty/unpublished only): dashboard_refresh_state, dashboard_snapshots,
-- materialization_definitions, analysis_plans, dashboard_versions, dashboards.

CREATE SCHEMA IF NOT EXISTS "dda";

INSERT INTO "platform"."schema_registry" ("schema_name", "owner_module")
VALUES ('dda', 'DDA')
ON CONFLICT ("schema_name") DO NOTHING;

CREATE TABLE "dda"."dashboards" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title_vi" VARCHAR(200) NOT NULL,
    "title_en" VARCHAR(200) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "draft_version_id" UUID,
    "published_version_id" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboards_scope_id_key" ON "dda"."dashboards"("organization_id", "workspace_id", "project_id", "id");
CREATE INDEX "dashboards_scope_idx" ON "dda"."dashboards"("organization_id", "workspace_id", "project_id");

CREATE TABLE "dda"."dashboard_versions" (
    "id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_version_id" UUID,
    "layout_graph" JSONB NOT NULL,
    "freshness_policy" VARCHAR(24) NOT NULL,
    "publication_policy" VARCHAR(24) NOT NULL,
    "locale" VARCHAR(32) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "canonical_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboard_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboard_versions_scope_id_key" ON "dda"."dashboard_versions"("organization_id", "workspace_id", "project_id", "id");
CREATE INDEX "dashboard_versions_scope_idx" ON "dda"."dashboard_versions"("organization_id", "workspace_id", "project_id", "dashboard_id");

CREATE TABLE "dda"."analysis_plans" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "dataset_version_id" UUID NOT NULL,
    "semantic_version_id" UUID NOT NULL,
    "metric_version_id" UUID NOT NULL,
    "permission_projection_version_id" UUID NOT NULL,
    "plan_document" JSONB NOT NULL,
    "plan_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "analysis_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analysis_plans_scope_id_key" ON "dda"."analysis_plans"("organization_id", "workspace_id", "project_id", "id");
CREATE INDEX "analysis_plans_scope_idx" ON "dda"."analysis_plans"("organization_id", "workspace_id", "project_id", "plan_id");

CREATE TABLE "dda"."materialization_definitions" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "dashboard_version_id" UUID NOT NULL,
    "widget_id" UUID NOT NULL,
    "analysis_plan_version_id" UUID NOT NULL,
    "result_manifest_id" UUID,
    "cache_identity_hash" CHAR(64) NOT NULL,
    "dependency_entries" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "materialization_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "materialization_definitions_scope_id_key" ON "dda"."materialization_definitions"("organization_id", "workspace_id", "project_id", "id");
CREATE UNIQUE INDEX "materialization_definitions_cache_key" ON "dda"."materialization_definitions"("organization_id", "workspace_id", "project_id", "cache_identity_hash");
CREATE INDEX "materialization_definitions_scope_idx" ON "dda"."materialization_definitions"("organization_id", "workspace_id", "project_id", "dashboard_version_id");

CREATE TABLE "dda"."dashboard_snapshots" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "dashboard_version_id" UUID NOT NULL,
    "materialization_ids" JSONB NOT NULL,
    "permission_projection_version_id" UUID NOT NULL,
    "audience" VARCHAR(32) NOT NULL,
    "freshness_state" VARCHAR(32) NOT NULL,
    "evidence_state" VARCHAR(24) NOT NULL,
    "evidence_reference_id" UUID,
    "canonical_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboard_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboard_snapshots_scope_id_key" ON "dda"."dashboard_snapshots"("organization_id", "workspace_id", "project_id", "id");
CREATE INDEX "dashboard_snapshots_scope_idx" ON "dda"."dashboard_snapshots"("organization_id", "workspace_id", "project_id", "dashboard_version_id");

CREATE TABLE "dda"."dashboard_refresh_state" (
    "id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "freshness_policy" VARCHAR(24) NOT NULL,
    "last_snapshot_id" UUID,
    "last_job_id" UUID,
    "status" VARCHAR(32) NOT NULL,
    "reason_code" VARCHAR(64),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboard_refresh_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboard_refresh_state_scope_dashboard_key" ON "dda"."dashboard_refresh_state"("organization_id", "workspace_id", "project_id", "dashboard_id");
CREATE INDEX "dashboard_refresh_state_scope_idx" ON "dda"."dashboard_refresh_state"("organization_id", "workspace_id", "project_id");
