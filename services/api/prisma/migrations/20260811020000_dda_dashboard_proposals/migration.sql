-- DDA-015/017/019/021: additive, tenant-scoped preview proposal metadata.
-- No prompts, provider payloads, source rows, evidence snippets, credentials, or result values are stored.
-- Rollback policy: leave this table in place during application rollback; cleanup requires a reviewed retention migration.

CREATE TABLE "dda"."dashboard_proposals" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "parent_version_id" UUID NOT NULL,
    "analysis_plan_version_id" UUID NOT NULL,
    "expected_revision" INTEGER NOT NULL,
    "state" VARCHAR(24) NOT NULL,
    "proposal_document" JSONB NOT NULL,
    "actor_id" UUID NOT NULL,
    "accepted_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboard_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboard_proposals_scope_id_key"
  ON "dda"."dashboard_proposals"("organization_id", "workspace_id", "project_id", "id");

CREATE INDEX "dashboard_proposals_dashboard_created_idx"
  ON "dda"."dashboard_proposals"("organization_id", "workspace_id", "project_id", "dashboard_id", "created_at");

CREATE INDEX "dashboard_proposals_state_idx"
  ON "dda"."dashboard_proposals"("organization_id", "workspace_id", "project_id", "state");
