-- DDA-036 durable runtime metadata: refresh executions/idempotency/event correlations,
-- ETL proposals, removed-widget drafts, dependency sequence/processed-event pointers.
-- Metadata only — no original bytes, OCR text, filenames, local paths, or result rows.
-- Rollback (empty/unpublished only): drop new tables in reverse order.

CREATE TABLE "dda"."dashboard_refresh_executions" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "dashboard_version_id" UUID NOT NULL,
    "permission_projection_version_id" UUID NOT NULL,
    "dataset_version_id" UUID NOT NULL,
    "definition_ids" JSONB NOT NULL,
    "input_selector_hash" CHAR(64) NOT NULL,
    "source_event_ids" JSONB NOT NULL,
    "client_request_ids" JSONB NOT NULL,
    "folder_replay_keys" JSONB NOT NULL,
    "state" VARCHAR(32) NOT NULL,
    "lease_id" VARCHAR(128),
    "debounce_window_ms" INTEGER NOT NULL,
    "opened_at_ms" BIGINT NOT NULL,
    "updated_at_ms" BIGINT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboard_refresh_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dashboard_refresh_executions_open_idx"
  ON "dda"."dashboard_refresh_executions"("organization_id", "workspace_id", "project_id", "dashboard_id", "state");

CREATE TABLE "dda"."dashboard_refresh_idempotency" (
    "key_kind" VARCHAR(32) NOT NULL,
    "key_value" VARCHAR(200) NOT NULL,
    "refresh_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "dashboard_refresh_idempotency_pkey" PRIMARY KEY ("key_kind", "key_value")
);

CREATE INDEX "dashboard_refresh_idempotency_scope_idx"
  ON "dda"."dashboard_refresh_idempotency"("organization_id", "workspace_id", "project_id");

CREATE TABLE "dda"."dashboard_refresh_event_correlations" (
    "event_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "freshness_state" VARCHAR(32) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "event_hash" CHAR(64) NOT NULL,

    CONSTRAINT "dashboard_refresh_event_correlations_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "dashboard_refresh_event_corr_scope_idx"
  ON "dda"."dashboard_refresh_event_correlations"("organization_id", "workspace_id", "project_id", "dashboard_id");

CREATE TABLE "dda"."etl_proposals" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "state" VARCHAR(32) NOT NULL,
    "blocking_reasons" JSONB NOT NULL,
    "plan_document" JSONB NOT NULL,
    "review_document" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "etl_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "etl_proposals_scope_idx"
  ON "dda"."etl_proposals"("organization_id", "workspace_id", "project_id");

CREATE TABLE "dda"."dashboard_removed_widgets" (
    "dashboard_id" UUID NOT NULL,
    "widget_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "widget_document" JSONB NOT NULL,

    CONSTRAINT "dashboard_removed_widgets_pkey" PRIMARY KEY ("dashboard_id", "widget_id")
);

CREATE INDEX "dashboard_removed_widgets_scope_idx"
  ON "dda"."dashboard_removed_widgets"("organization_id", "workspace_id", "project_id");

CREATE TABLE "dda"."dependency_processed_events" (
    "event_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "dependency_processed_events_pkey" PRIMARY KEY ("event_id")
);

CREATE TABLE "dda"."dependency_sequences" (
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "highest_sequence" INTEGER NOT NULL,

    CONSTRAINT "dependency_sequences_pkey" PRIMARY KEY ("organization_id", "workspace_id", "project_id")
);
